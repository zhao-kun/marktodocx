# Style Propagation Regression Fixture

This fixture is reserved for validating non-default style propagation once style-aware host parity is wired in.

## Body Text

This paragraph is intended to make body typography changes visible under a non-default preset.

## Blockquote

> Blockquote styling should change together with the selected preset.

## Code Block

```javascript
export function makeGreeting(name) {
  return `Hello, ${name}`;
}
```

## Table

| Area | Expected under non-default preset |
| --- | --- |
| Table header | Header colors and text colors change |
| Borders | Border color changes |
| Body text | Body font rules still apply |