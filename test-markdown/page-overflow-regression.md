# Page Overflow Regression Fixture

This fixture exists specifically to stress pagination, repeated paragraph flow, and tall block layout.

## Overflow Setup

The paragraphs below are intentionally repetitive so the document spans multiple pages and exposes layout drift that only appears once content continues past the first page.

### Repeated Narrative

Paragraph 1. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 2. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 3. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 4. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 5. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 6. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 7. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 8. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 9. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 10. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 11. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 12. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 13. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 14. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

Paragraph 15. This paragraph is intentionally verbose and repeated to force the renderer to handle normal body text flow across page boundaries without collapsing margins, breaking list indentation, or clipping table borders.

## Tall Code Block

```text
line 01
line 02
line 03
line 04
line 05
line 06
line 07
line 08
line 09
line 10
line 11
line 12
line 13
line 14
line 15
line 16
line 17
line 18
line 19
line 20
line 21
line 22
line 23
line 24
line 25
line 26
line 27
line 28
line 29
line 30
```

## Late Table

| Section | Expectation |
| --- | --- |
| Body flow | Continues cleanly over page breaks |
| Code block | Keeps cell borders and padding |
| Table | Does not lose header styling near page boundaries |
| Final paragraph | Appears after the table without overlap |

Final paragraph after the table to ensure tail content still renders cleanly after the overflow-heavy sections above.