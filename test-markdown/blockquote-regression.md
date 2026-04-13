# Blockquote Regression Fixture

This fixture isolates the recent blockquote regressions so the golden corpus can catch them directly.

> This blockquote should keep its background styling.
>
> It also includes **bold**, *italic*, and `inline code`.
>
> Second paragraph in the same quote.

Normal paragraph after the quote.

> Nested list coverage:
>
> - First bullet
> - Second bullet with `inline code`
> - Third bullet with **bold text**

| Case | Expected |
| --- | --- |
| Quote background | Preserved |
| Inline formatting | Preserved |
| Following paragraph | Not absorbed into quote |