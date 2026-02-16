# Arda Design System - Comprehensive Extraction

> Extracted from https://live.app.arda.cards/ on 2026-02-13
> Source: Sign-in, Sign-up, and Reset Password pages (Next.js application)
> Framework: Next.js + Tailwind CSS + shadcn/UI component architecture

---

## 1. Color System

### Brand Colors

| Token                     | Hex       | RGB               | Usage                          |
|---------------------------|-----------|-------------------|--------------------------------|
| `--base-primary`          | `#FC5A29` | `rgb(252, 90, 41)`| Primary brand orange, CTAs     |
| `--base-primary-foreground`| `#FAFAFA` | `rgb(250,250,250)`| Text on primary backgrounds    |
| `--accent-light`          | `#FEF7F5` |                   | Light orange tint/hover        |

### Neutral Colors

| Token                        | Hex       | RGB                | Usage                        |
|------------------------------|-----------|--------------------|-----------------------------|
| `--base-background`         | `#FFFFFF` | `rgb(255,255,255)` | Page/card backgrounds        |
| `--base-foreground`         | `#0A0A0A` | `rgb(10, 10, 10)`  | Primary text                 |
| `--base-muted-foreground`   | `#737373` | `rgb(115,115,115)` | Secondary/muted text         |
| `--base-accent-foreground`  | `#171717` |                    | Dark accent text             |
| `--base-border`             | `#E5E5E5` | `rgb(229,229,229)` | Borders, dividers            |
| `--base-input`              | `#E5E5E5` | `rgb(229,229,229)` | Input borders                |
| `--base-secondary`          | `#F5F5F5` |                    | Secondary backgrounds        |
| `--base-muted`              | `#F5F5F5` |                    | Muted backgrounds            |
| `--base-card`               | `#FFFFFF` |                    | Card backgrounds             |

### Semantic Colors

| Token                    | Hex       | Usage                          |
|--------------------------|-----------|--------------------------------|
| `--base-destructive`     | `#DC2626` | Error states, required markers |
| `--colors-link-light`    | `#0A68F3` | Blue link color                |
| `--bg-sidebar-accent`    | `#EF4444` | Sidebar accent red             |

### Form-Specific Colors

| Token                        | Hex       | Usage                     |
|------------------------------|-----------|---------------------------|
| `--form-text-primary`        | `#0A0A0A` | Form text                 |
| `--form-text-secondary`      | `#737373` | Form helper text          |
| `--form-background`          | `#FFFFFF` | Form background           |
| `--form-background-secondary`| `#F3F4F6` | Form secondary background |
| `--form-separator`           | `#E5E5E5` | Form dividers             |
| `--form-switch-active`       | `#FC5A29` | Active toggle/switch      |
| `--form-switch-inactive`     | `#E5E5E5` | Inactive toggle/switch    |

### Sidebar Colors (oklch)

| Token                  | oklch Value                       | Usage           |
|------------------------|-----------------------------------|-----------------|
| `--sidebar`            | `oklch(98.4% .003 247.858)`      | Sidebar bg      |
| `--sidebar-foreground` | `oklch(12.9% .042 264.695)`      | Sidebar text    |
| `--sidebar-border`     | `oklch(92.9% .013 255.508)`      | Sidebar border  |
| `--sidebar-primary`    | `oklch(21.1% .034 264.665)`      | Sidebar primary |
| `--sidebar-accent`     | `oklch(96.7% .001 286.375)`      | Sidebar accent  |

### Chart Colors (oklch)

| Token      | oklch Value                      |
|------------|----------------------------------|
| `--chart-1`| `oklch(64.6% .222 41.116)`      |
| `--chart-2`| `oklch(60% .118 184.704)`       |
| `--chart-3`| `oklch(39.8% .07 227.392)`      |
| `--chart-4`| `oklch(82.8% .189 84.429)`      |
| `--chart-5`| `oklch(76.9% .188 70.08)`       |

### All Background Colors Found Across Pages

```
#FFFFFF  - Form backgrounds, cards, right panel
#FC5A29  - Left auth panel, primary buttons
#EFEFEF  - Marketing site body background
#000000  - Dark sections, navbar
#D7D7D7  - Secondary section backgrounds
#FFDEDE  - Light red/error background
#F3F4F6  - Form secondary background
rgba(252,89,40, 0.1)  - Orange tint overlay
rgba(255,255,255, 0.4) - White overlay
rgba(0,0,0, 0.5/0.6/0.7) - Dark overlays
```

### All Text Colors Found Across Pages

```
#0A0A0A  - Primary text (headings, labels)
#737373  - Secondary text (descriptions, helper text)
#FC5A29  - Links, brand accent text
#DC2626  - Error text, required asterisks
#FAFAFA  - Text on primary backgrounds (buttons)
#333333  - Marketing body text
#080808  - Dark headings
#686868  - Muted gray text
#222222  - Dark text variant
#252525  - Dark text variant
```

---

## 2. Typography

### Font Family

```css
--font-geist: "Geist", sans-serif;
```

**Primary font:** Geist (loaded as variable font via Next.js)
- Used for ALL app text (headings, body, labels, buttons)
- Fallback: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`

**Note:** The marketing site wrapper uses "Uncut Sans" as its body font, but the actual Arda application exclusively uses Geist.

### Type Scale

| Element          | Size   | Weight | Line Height | Letter Spacing | Color                |
|------------------|--------|--------|-------------|----------------|----------------------|
| H2 (Page title)  | 30px   | 700    | 36px        | normal         | `#0A0A0A`           |
| Body paragraph    | 14px   | 400    | 20px        | normal         | `#737373`           |
| Label             | 14px   | 500    | 21px        | normal         | `#0A0A0A`           |
| Input text        | 14px   | 400    | 20px        | normal         | `#0A0A0A`           |
| Button text       | 14px   | 500    | 20px        | normal         | `#FAFAFA` (on primary) |
| Helper text       | 12px   | 400    | 18px        | normal         | `#737373`           |
| Link text         | 14px   | 400    | 20px        | normal         | `#FC5A29`           |
| Required asterisk | 14px   | 500    | -           | -              | `#DC2626`           |
| Terms & Conditions| 14px   | 500    | -           | -              | blue (oklch)        |

### Font Weight Scale

```
400 - Regular (body text, links, helper text)
500 - Medium (labels, buttons, inline links)
600 - Semibold (used sparingly)
700 - Bold (headings)
```

### All Font Sizes Used

```
12px - Helper text, small annotations
14px - Body text, labels, buttons, inputs (primary size)
16px - Slightly larger body (marketing)
18px - Marketing CTA buttons
20px - Sub-headings (marketing)
22px - Medium headings
24px - Section headings
30px - Page titles (auth pages)
40px - Large headings (marketing)
48px - Hero headings
54px - Large display
60px - XL display
64px - XXL display (marketing hero)
```

---

## 3. Spacing System

### CSS Custom Property Scale

| Variable        | Value | Usage                      |
|-----------------|-------|----------------------------|
| `--spacing-1`   | 4px   | Tight spacing, input padding-top/bottom |
| `--spacing-2`   | 8px   | Label to input gap, checkbox gap, button gap |
| `--spacing-3`   | 12px  | Input horizontal padding   |
| `--spacing-4`   | 16px  | Form field group bottom margin, button horizontal padding |
| `--spacing-5`   | 20px  | Medium spacing             |
| `--spacing-6`   | 24px  | Form to button gap, section spacing |

### Tailwind Spacing Classes Used

```
space-y-2 - Label to input spacing (8px between children)
space-y-4 - Form field groups (16px between groups)
mt-6      - Form container margin-top (24px)
mb-8      - Logo area bottom margin (32px)
gap-2     - Button internal gap (8px)
p-6       - Right panel padding (24px)
px-4      - Horizontal padding (16px)
py-2      - Vertical padding (8px)
```

### Key Spacing Patterns

```
Logo to content:              32px margin-bottom
Heading to subtitle:          0px (tight coupling)
Subtitle to form:             24px margin-top
Between form field groups:    16px margin-bottom
Label to input:               8px (space-y-2)
Input to helper text:         0px (space-y-2, visually ~4px)
Form to CTA button:           0px (direct child)
Button to help links:         24px margin-top
Right panel padding:          40px 24px
```

---

## 4. Border Radius

### Base Radius Variable

```css
--radius: 0.625rem; /* 10px */
```

### Component-Specific Radii

| Component        | Radius | Notes                        |
|------------------|--------|------------------------------|
| Input fields     | 10px   | `--radius` value             |
| Primary buttons  | 8px    | Slightly less than inputs    |
| Checkbox         | 4px    | Small, square-ish            |
| Cards            | 12px   | Larger for card containers   |
| Pills/badges     | 100px  | Fully rounded                |
| Avatar/circle    | 50%    | Perfect circle               |

### All Border Radii Found

```
4px    - Checkbox, small elements
6px    - Minor components
8px    - Buttons
10px   - Input fields (base --radius)
12px   - Cards
13px   - Slight variant
20px   - Rounded containers
40px   - Pill-like shapes
50px   - Large pills
100px  - Fully rounded pills
100%   - Circles (avatars)
```

---

## 5. Shadows

### Shadow Scale

| Name              | Value                                                              | Usage           |
|-------------------|--------------------------------------------------------------------|-----------------|
| Shadow-sm (button)| `rgba(0,0,0,0.05) 0px 1px 2px 0px`                               | Buttons         |
| Shadow-md (input) | `rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px` | Input fields |
| Shadow-lg (card)  | `rgba(0,0,0,0.05) 0px 0px 4px 2px`                               | Cards           |
| Shadow-xl         | `rgba(0,15,20,0.1) 0px 4px 8px 0px`                              | Elevated cards  |

---

## 6. Component Specifications

### Primary Button (CTA)

```css
/* Sign in / Sign up / Send reset link */
background-color: #FC5A29;        /* rgb(252, 90, 41) */
color: #FAFAFA;                   /* rgb(250, 250, 250) */
border-radius: 8px;
padding: 8px 16px;
height: 36px;
width: 384px;                     /* Full-width within form (100%) */
font-size: 14px;
font-weight: 500;
font-family: Geist;
line-height: 20px;
border: none;
box-shadow: rgba(0,0,0,0.05) 0px 1px 2px 0px;
cursor: pointer;
display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;
white-space: nowrap;
transition: all;
/* Disabled state: pointer-events: none; opacity: 0.5 */
```

### Text Input

```css
/* Email, Password, Name fields */
border-radius: 10px;
border: 1px solid #E5E5E5;       /* rgb(229, 229, 229) */
height: 36px;
width: 384px;                     /* Full-width within form */
padding: 4px 12px;               /* Password field: 4px 40px 4px 12px (for icon) */
font-size: 14px;
font-family: Geist;
background-color: white;
box-shadow: rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px;
outline: none;
/* Focus state: ring with brand color expected */
```

### Checkbox

```css
width: 16px;
height: 16px;
border-radius: 4px;
border: 1px solid oklch(92.9% .013 255.508); /* approximately #E5E5E5 */
background-color: transparent;
/* Checked state: background-color: #FC5A29, with white checkmark icon */
```

### Show Password Toggle Button

```css
background-color: transparent;
border: none;
width: 16px;
height: 16px;
padding: 0;
cursor: pointer;
/* Contains eye icon SVG */
position: absolute;
right: 12px;
top: 50%;
transform: translateY(-50%);
```

### Link (Inline Text Link)

```css
color: #FC5A29;                    /* Brand orange */
font-size: 14px;
font-weight: 400;
text-decoration: underline;
cursor: pointer;
```

### Terms & Conditions Link (Special Variant)

```css
color: oklch(0.546 0.245 262.881); /* Blue color */
font-size: 14px;
font-weight: 500;
text-decoration: underline;
cursor: pointer;
background-color: transparent;
border: none;
padding: 0;
```

### Form Label

```css
font-family: Geist;
font-size: 14px;
font-weight: 500;
line-height: 21px;
color: #0A0A0A;                    /* rgb(10, 10, 10) */
margin-bottom: 8px;               /* space-y-2 gap */
display: block;
```

### Required Asterisk

```css
color: #DC2626;                    /* rgb(220, 38, 38) */
font-size: 14px;
font-weight: 500;
/* Placed inline after label text */
```

### Helper/Description Text

```css
font-family: Geist;
font-size: 12px;
font-weight: 400;
line-height: 18px;
color: #737373;                    /* rgb(115, 115, 115) */
```

---

## 7. Layout Patterns

### Auth Page Layout (Two-Panel Split)

```
Container:
  display: grid
  grid-template-columns: 600px 600px    (50/50 split)
  width: 1200px
  min-height: 100vh (fills viewport)

Left Panel (Brand):
  width: 600px
  height: 100% (matches container)
  background-color: #FC5A29
  position: relative
  overflow: hidden

  Decorative Overlay:
    position: absolute
    width: ~1330px (extends beyond panel)
    height: ~1025px
    background: linear-gradient(rgba(255,255,255,0.1) 0%, rgba(252,90,41,0.2) 68%)
    transform: matrix(1, 0, -0.700208, 1, 0, 0)  /* skewX(-35deg) */
    /* Creates diagonal stripe effect */

  Logo:
    position: top-left
    padding: 32px
    src: /images/ArdaLogoV1.svg
    size: 40px x 26.7px (displayed)
    natural size: 45px x 30px

Right Panel (Form):
  width: 600px
  height: 100%
  background-color: #FFFFFF
  display: flex
  justify-content: center
  align-items: center
  padding: 40px 24px

  Form Container:
    width: 384px    (max form content width)

    Structure:
    1. Logo area (32px margin-bottom)
    2. Heading block (h2 + subtitle paragraph)
    3. Form fields (24px margin-top)
    4. Help links (24px margin-top)
```

### Form Field Group Pattern

```
<div class="space-y-2">           <!-- 8px gap between children -->
  <label>                          <!-- 14px, 500 weight -->
    Field Name <span class="text-destructive">*</span>
  </label>
  <input />                        <!-- 36px height, 10px radius -->
  <p class="helper-text">          <!-- 12px, 400 weight, #737373 -->
    Helper text here
  </p>
</div>
<!-- 16px margin-bottom between groups -->
```

### Mobile Considerations

- A separate mobile logo exists: `/images/ArdaLogoMobileV1.svg` (hidden on desktop)
- The grid likely collapses to single column on smaller screens
- Body class includes `min-h-screen antialiased`

---

## 8. Icons & Logos

### App Logo

| Asset                          | URL                                                    | Display Size     | Natural Size   |
|-------------------------------|--------------------------------------------------------|-----------------|----------------|
| Desktop logo (auth)           | `/images/ArdaLogoV1.svg`                               | 40px x 26.7px   | 45px x 30px   |
| Mobile logo (auth)            | `/images/ArdaLogoMobileV1.svg`                         | hidden          | -              |
| Marketing logo (large, SVG)   | CDN: `arda_logo_large_background (1) 1.svg`            | 90px x 50.7px   | -              |

### Feature Icons (CDN-hosted SVGs)

| Icon Name              | URL Pattern (website-files CDN)                     | Display Size |
|-----------------------|-----------------------------------------------------|-------------|
| Search                | `.../Search Icon.svg`                               | 33x32       |
| Write                 | `.../Write Icon.svg`                                | 33x32       |
| Knowledge             | `.../Knowledge Global Education.svg`                | 33x32       |
| Press                 | `.../Press Icon.svg`                                | 33x32       |
| Chart Statistics      | `.../Chart Statistics.svg`                          | 32x32       |
| Chevron Right (orange)| `.../chevron-right.svg`                             | 48x49       |
| Chevron Right (gray)  | `.../chevron-right (1).svg`                         | 48x49       |
| Play                  | `.../play-icon.svg`                                 | 14x16       |
| Play Black            | `.../play black.svg`                                | 14x16       |
| Arrow Right           | `.../arrow-right.svg`                               | 6px wide    |
| Chevron Down          | `.../chevron-down.svg`                              | -           |
| Hamburger             | `.../align-justify.svg`                             | -           |
| Close (X)             | `.../x.svg`                                         | -           |
| Check Orange          | `.../check in icon orange.svg`                      | 20px        |
| Time                  | `.../time.svg`                                      | 24x25       |

### Social Media Icons

| Platform  | Format | Size  |
|-----------|--------|-------|
| YouTube   | SVG    | 16x16 |
| TikTok    | PNG    | 16x16 |
| Others    | SVG    | 16x16 |

### Feature Illustration Icons (Orange, Noun-style)

Used at 50x50px display size. All are 1600x1600px source SVGs:
- `noun-replenish.svg`
- `noun-machine-shop.svg`
- `noun-integration.svg`
- `noun-speed.svg`
- `noun-growth-bar.svg`

### Password Toggle Icon

The show/hide password button uses an eye icon SVG (16x16px), rendered as an `<img>` tag inside a transparent button positioned absolutely within the password input wrapper.

---

## 9. CSS Custom Properties (Complete Reference)

```css
:root {
  /* Brand */
  --base-primary: #fc5a29;
  --base-primary-foreground: #fafafa;
  --accent-light: #fef7f5;

  /* Backgrounds */
  --base-background: #fff;
  --base-card: #fff;
  --base-popover: #fff;
  --base-secondary: #f5f5f5;
  --base-muted: #f5f5f5;

  /* Text */
  --base-foreground: #0a0a0a;
  --base-accent-foreground: #171717;
  --base-muted-foreground: #737373;
  --base-secondary-foreground: #171717;
  --base-card-foreground: #0a0a0a;
  --base-popover-foreground: #0a0a0a;
  --base-destructive: #dc2626;

  /* Borders & Inputs */
  --base-border: #e5e5e5;
  --base-input: #e5e5e5;
  --base-ring: #0a0a0a;
  --base-accent: #f5f5f5;

  /* Typography */
  --font-geist: "Geist", sans-serif;

  /* Spacing */
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;

  /* Border Radius */
  --radius: .625rem;  /* 10px */

  /* Form-Specific */
  --form-separator: #e5e5e5;
  --form-text-primary: #0a0a0a;
  --form-text-secondary: #737373;
  --form-background: #fff;
  --form-background-secondary: #f3f4f6;
  --form-switch-active: #fc5a29;
  --form-switch-inactive: #e5e5e5;

  /* Other */
  --hover-color: #282828;
  --colors-link-light: #0a68f3;
  --bg-sidebar-accent: #ef4444;

  /* Sidebar (oklch) */
  --sidebar: oklch(98.4% .003 247.858);
  --sidebar-foreground: oklch(12.9% .042 264.695);
  --sidebar-primary: oklch(21.1% .034 264.665);
  --sidebar-primary-foreground: oklch(98.4% .003 247.858);
  --sidebar-accent: oklch(96.7% .001 286.375);
  --sidebar-accent-foreground: oklch(21.1% .034 264.665);
  --sidebar-border: oklch(92.9% .013 255.508);
  --sidebar-ring: oklch(55.4% .046 257.417);

  /* Chart Colors (oklch) */
  --chart-1: oklch(64.6% .222 41.116);
  --chart-2: oklch(60% .118 184.704);
  --chart-3: oklch(39.8% .07 227.392);
  --chart-4: oklch(82.8% .189 84.429);
  --chart-5: oklch(76.9% .188 70.08);
}
```

---

## 10. Design Patterns & Notes

### Component Framework
- Built on **shadcn/UI** (evidenced by class naming: `space-y-2`, `inline-flex`, Tailwind utility classes, and CSS variable naming conventions matching shadcn defaults)
- Uses **Tailwind CSS v4** (evidenced by `--tailwind-colors-*` variables and oklch color space usage)
- Rendered with **Next.js** (page title format, SSR, font loading via `next/font`)

### Auth Page Decorative Element
The left orange panel features a single decorative overlay element:
- A large div (~1330px x 1025px) with `position: absolute`
- Background: `linear-gradient(rgba(255,255,255,0.1) 0%, rgba(252,90,41,0.2) 68%)`
- Transform: `skewX(-35deg)` (via matrix transform)
- This creates the subtle diagonal stripe/sheen effect visible on the orange panel

### Disabled States
- Buttons: `pointer-events: none; opacity: 0.5`
- The Sign up button appears disabled by default (cursor: default) until form is valid

### Focus States
- Inputs use a ring-based focus indicator (standard shadcn/UI pattern)
- `outline` color references oklch values

### Anti-aliasing
- Body class includes `antialiased` for smooth font rendering

### Responsive Notes
- Desktop: 1200px grid (600px + 600px)
- Mobile: Expected to collapse to single column (mobile logo variant exists)
- Form width capped at 384px regardless of viewport

### Toast/Notification System
- A notification region exists: `region "Notifications alt+T"`
- An `alert` role element is present for form validation messages

---

## 11. Quick Reference - Key Values

```
Brand Orange:     #FC5A29
Dark Text:        #0A0A0A
Muted Text:       #737373
Border Gray:      #E5E5E5
Error Red:        #DC2626
White:            #FFFFFF
Background:       #FFFFFF

Font:             Geist
Base Size:        14px
Heading Size:     30px
Helper Size:      12px

Input Height:     36px
Button Height:    36px
Form Width:       384px
Input Radius:     10px
Button Radius:    8px

Button Shadow:    rgba(0,0,0,0.05) 0px 1px 2px 0px
Input Shadow:     rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px

Logo SVG:         /images/ArdaLogoV1.svg
```
