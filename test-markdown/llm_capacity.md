# LLM 基础设施容量报告
### Qwen3-32B on vLLM | 并发用户容量规划 + 峰值吞吐量规划

---

## 第一部分 — 模型切换：Qwen3-32B 重新计算

### 1.1 模型架构参考

Qwen3-32B 是一个 64 层 transformer，拥有 328 亿参数，使用分组查询注意力（GQA），64 个查询头和 8 个键值头，原生上下文长度为 32,768 tokens。头维度为 128，已由 Hugging Face 配置确认。

| 参数            | DeepSeek-R1-Distill-70B（之前） | **Qwen3-32B（新）** |
| ------------- | --------------------------- | ---------------- |
| 总参数量          | 70B                         | **32.8B**        |
| 层数（`L`）       | 80                          | **64**           |
| KV 头数（`H_kv`） | 8                           | **8**            |
| 头维度（`D`）      | 128                         | **128**          |
| 注意力类型         | GQA                         | **GQA**          |
| 原生上下文         | 32,768                      | **32,768**       |
| 数据类型（默认）      | bf16                        | **bf16**         |

---

### 1.2 公式 1 — 模型权重显存

```
Model_Memory = num_params × bytes_per_dtype
```

| 精度 | 计算 | 结果 |
|---|---|---|
| bf16 | 32.8B × 2 字节 | **65.6 GB** |
| fp8 | 32.8B × 1 字节 | 32.8 GB |
| int4 | 32.8B × 0.5 字节 | 16.4 GB |

> **基准（bf16）：每台机器 65.6 GB** — 不到 DeepSeek-70B 的 140 GB 的一半。

---

### 1.3 公式 2 — 每 Token 的 KV Cache

```
KV_per_token = 2 × H_kv × D × L × bytes_per_dtype
             = 2 × 8 × 128 × 64 × 2
             = 262,144 字节 ≈ 256 KB/token
```

> 与 DeepSeek-70B 的 320 KB/token 相比，Qwen3-32B 由于层数更少（64 vs 80），**KV 效率高 20%**。

---

### 1.4 公式 3 — 每并发用户的 KV Cache（32k 上下文）

```
KV_per_user = KV_per_token × context_length
            = 256 KB × 32,768
            ≈ 8 GB/用户（最坏情况，所有 32k slot 填满）
            ≈ 5.2 GB/用户（现实情况，~65% 平均 page 填充，通过 PagedAttention）
```

---

### 1.5 公式 4 — 每台机器可用的 KV Cache 显存

```
Available_KV = Total_GPU_Memory − Model_Memory − System_Overhead

System_Overhead ≈ 25–30 GB（CUDA 内核、激活值、vLLM 运行时）

Available_KV = 512 − 65.6 − 28 = 418 GB
```

> Qwen3-32B 每台机器为 KV cache 释放**约 76 GB 更多空间**（对比 DeepSeek-70B：342 GB → 418 GB）。

---

### 1.6 公式 5 — 每台机器最大并发用户数（显存受限）

```
Max_Users_memory = Available_KV / KV_per_user
```

| 场景 | KV/用户 | 最大用户数/机器 |
|---|---|---|
| 最坏情况（100% 32k 填满） | 8.0 GB | **~52 用户** |
| 现实情况（65% 平均填充） | 5.2 GB | **~80 用户** |

---

### 1.7 公式 6 — 解码吞吐量检查（计算受限）

```
理论 TPS = FLOPS / (2 × num_params)
        = 2.2×10¹⁵ / (2 × 32.8×10⁹)
        ≈ 33,500 tokens/sec（理论峰值）

实际 TPS   = 理论 TPS × MFU
        ≈ 33,500 × 0.35
        ≈ 11,700 tokens/sec/机器
```

在 **20 tokens/sec/用户** 平均输出速率下：

```
Max_Users_compute = 11,700 / 20 = ~585 并发用户/机器
```

> ⚠️ 计算仍然**不是瓶颈**。显存容量（80 用户/机器）是约束条件。

---

### 1.8 公式 7 — 所需机器数量

```
Num_Machines = ceil(Target_Concurrent / Max_Users_memory)
```

| 目标 | 现实情况（80 用户/机器） | 最坏情况（52 用户/机器） |
|---|---|---|
| 300 用户 | **ceil(300/80) = 4 台机器** | ceil(300/52) = 6 台机器 |
| 500 用户 | **ceil(500/80) = 7 台机器** | ceil(500/52) = 10 台机器 |

---

### 1.9 模型对比总结

| 指标 | DeepSeek-70B | **Qwen3-32B** | 变化 |
|---|---|---|---|
| 模型权重（bf16） | 140 GB | **65.6 GB** | −74 GB ✅ |
| KV/token | 320 KB | **256 KB** | −20% ✅ |
| KV/用户 @ 32k（现实） | 6.5 GB | **5.2 GB** | −20% ✅ |
| 可用 KV/机器 | 342 GB | **418 GB** | +76 GB ✅ |
| 用户/机器（现实） | ~52 | **~80** | +54% ✅ |
| 500 用户所需机器 | 10 | **7** | −30% ✅ |

**建议：500 并发用户需 7–8 台机器，300 并发用户需 4–5 台机器。**

---
---

## 第二部分 — 峰值吞吐量容量规划：11,000 tokens/sec

本节回答："*我需要多少台机器来维持 11,000 tokens/sec 的系统级峰值输出？*"

峰值吞吐量容量规划是**计算 + 显存带宽受限**，不仅仅是 KV 容量受限。必须同时评估两个约束条件。

---

### 2.1 公式 8 — 每台机器的实际吞吐量

```
理论 TPS_per_machine = FLOPS / (2 × num_params)
                     = 2.2×10¹⁵ / (2 × 32.8×10⁹)
                     ≈ 33,500 tokens/sec

实际 TPS_per_machine = 理论 TPS × MFU
```

| MFU 假设                    | 实际 TPS/机器       |
| ------------------------- | --------------- |
| 35%（解码为主，显存带宽受限）          | **~11,700 TPS** |
| 45%（prefill+decode 混合，分块） | **~15,100 TPS** |
| 55%（prefill 为主 batch）     | **~18,400 TPS** |

> 对于**持续的混合流量负载**，使用 **35–45% MFU** 作为现实范围。

---

### 2.2 公式 9 — 目标吞吐量所需机器数

```
Num_Machines_compute = ceil(Target_TPS / Practical_TPS_per_machine)
```

**示例 — 目标：11,000 tokens/sec**

```
35% MFU：ceil(11,000 / 11,700) = ceil(0.94) = 1 台机器
45% MFU：ceil(11,000 / 15,100) = ceil(0.73) = 1 台机器
```

> 从计算角度，**1 台机器**使用 Qwen3-32B 即可维持 11,000 TPS。但还必须检查显存容量。

---

### 2.3 公式 10 — 吞吐量目标隐含的并发用户数

要维持 11,000 TPS，需要知道有多少并发用户产生该负载：

```
Implied_Concurrent_Users = Target_TPS / avg_tokens_per_sec_per_user
```

| 平均输出速率/用户 | 隐含并发用户数 |
|---|---|
| 10 tok/s（慢速生成） | 1,100 用户 |
| 20 tok/s（标准） | 550 用户 |
| 40 tok/s（快速/短输出） | 275 用户 |

> 隐含的并发数决定了**显存还是计算**成为真正的约束条件。

---

### 2.4 公式 11 — 组合约束检查

计算吞吐量和显存容量必须同时满足：

```
Machines_compute = ceil(Target_TPS / Practical_TPS_per_machine)
Machines_memory  = ceil(Implied_Users / Max_Users_per_machine)

Num_Machines = max(Machines_compute, Machines_memory)
```

**完整示例 — 11,000 TPS @ 20 tok/s/用户（标准）**

```
Implied_Users        = 11,000 / 20 = 550 并发用户

Machines_compute     = ceil(11,000 / 11,700) = 1 台机器
Machines_memory      = ceil(550 / 80)        = 7 台机器

Num_Machines         = max(1, 7) = 7 台机器
```

**完整示例 — 11,000 TPS @ 40 tok/s/用户（快速/突发）**

```
Implied_Users        = 11,000 / 40 = 275 并发用户

Machines_compute     = ceil(11,000 / 11,700) = 1 台机器
Machines_memory      = ceil(275 / 80)        = 4 台机器

Num_Machines         = max(1, 4) = 4 台机器
```

---

### 2.5 峰值吞吐量结果表

| 平均输出速率 | 隐含用户数 | 计算机器数 | 显存机器数 | **所需** |
|---|---|---|---|---|
| 10 tok/s | 1,100 | 1 | 14 | **14 台机器** |
| 20 tok/s | 550 | 1 | 7 | **7 台机器** |
| 40 tok/s | 275 | 1 | 4 | **4 台机器** |

> **关键洞察：** 对于 Qwen3-32B 的 11,000 TPS，系统几乎总是**显存容量受限**，而非计算受限。所需机器数随隐含并发数增长，而非原始 FLOP 需求。

---

### 2.6 添加峰值突发缓冲

生产系统应包含**20–30% 余量**缓冲，用于：
- 流量峰值吸收
- 滚动重启/维护窗口
- 高负载下的 prefill 延迟尖峰

```
Machines_with_buffer = ceil(Num_Machines × 1.25)
```

| 场景 | 基础机器数 | 25% 缓冲后 |
|---|---|---|
| 11,000 TPS @ 20 tok/s | 7 | **9 台机器** |
| 11,000 TPS @ 40 tok/s | 4 | **5 台机器** |

---

## 第三部分 — 优化手段（两种场景）

| 优化项 | 机制 | 收益 |
|---|---|---|
| **fp8 量化** | 模型：65.6 GB → 32.8 GB | +~32 GB KV 余量；每台机器多 ~10–15% 用户 |
| **Prefix Caching** | 共享 system prompt pages 复用 | 减少 chatbot 负载的有效 KV/用户 |
| **限制 `max_model_len`** | 例如 16,384 而非 32,768 | 减半最坏情况 KV/用户；翻倍显存受限容量 |
| **Chunked Prefill** | prefill 与 decode batch 交错 | MFU 从 ~35% 提升至 ~45–50%；提高 TPS |
| **Continuous Batching** | vLLM 默认；最大化 GPU 利用率 | 减少请求间空闲时间 |
| **张量并行** | 节点内跨 GPU 分片模型 | 支持更大的每台机器 batch size |

### 优化场景（fp8 + prefix caching + 16k 上限）

```
Model_Memory     = 32.8 GB（fp8）
Available_KV     = 512 − 32.8 − 28 = 451 GB
KV_per_user      ≈ 2.6 GB（fp8 KV, 16k 上下文，65% 填充）
Max_Users/machine = 451 / 2.6 ≈ 173 用户

500 用户：ceil(500 / 173) = 3 台机器
11,000 TPS @ 20 tok/s（550 用户）：ceil(550 / 173) = 4 台机器
```

---

## 第四部分 — 完整总结

### 机器数量参考表（Qwen3-32B, 512 GB, 2.2 PFLOPS, bf16）

| 用例 | 场景 | 所需机器数 | 25% 缓冲后 |
|---|---|---|---|
| **并发用户** | 300 用户，现实 | 4 | 5 |
| **并发用户** | 300 用户，最坏 | 6 | 8 |
| **并发用户** | 500 用户，现实 | 7 | 9 |
| **并发用户** | 500 用户，最坏 | 10 | 13 |
| **峰值吞吐量** | 11,000 TPS @ 20 tok/s | 7 | 9 |
| **峰值吞吐量** | 11,000 TPS @ 40 tok/s | 4 | 5 |
| **优化**（fp8 + 16k 上限） | 500 用户 | 3 | 4 |

### 关键变量参考

| 符号 | 含义 | Qwen3-32B 值 |
|---|---|---|
| `P` | 总参数量 | 32.8B |
| `L` | 层数 | 64 |
| `H_kv` | KV 头数（GQA） | 8 |
| `D` | 头维度 | 128 |
| `B` | 每数据类型字节数（bf16） | 2 |
| `C` | 上下文长度 | 32,768 |
| `FLOPS` | 机器计算能力 | 2.2×10¹⁵ |
| `MFU` | 模型 FLOP 利用率 | 0.35（解码） |
| `OH` | 系统开销 | ~28 GB |
| `GPU_MEM` | 总 GPU 显存 | 512 GB |

---

*报告基于 Hugging Face 确认的 Qwen3-32B 架构规格（Qwen/Qwen3-32B）。所有估算假设使用带 PagedAttention 的 vLLM 和同质 GPU 节点。*
*报告中没有考虑多卡并行带宽影响。但是可以通过横向扩展来弥补*
