# Arda Brand Design System Reference

Extracted from arda.cards (marketing site) and live.app.arda.cards (application).
Last updated: 2026-02-13

---

## 1. Brand Colors

### Primary Brand Color

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Arda Orange** | `#FC5A29` | rgb(252, 90, 41) | Primary CTA buttons, accent text, stat numbers, links in app, active toggles |

The primary orange appears consistently across both the marketing site and app as THE signature brand color.

### Core Color Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Black | `#000000` | rgb(0, 0, 0) | Header bg, secondary CTAs, headings |
| Near Black | `#0A0A0A` | rgb(10, 10, 10) | App foreground text (--base-foreground) |
| Dark Text | `#080808` | rgb(8, 8, 8) | Marketing headings |
| Dark Gray | `#222222` | rgb(34, 34, 34) | Footer text emphasis |
| Medium Dark | `#252525` | rgb(37, 37, 37) | Submit button text on light bg |
| Medium Dark | `#333333` | rgb(51, 51, 51) | Body text, feature descriptions |
| Medium Gray | `#686868` | rgb(104, 104, 104) | Paragraph text, descriptions |
| Body Text Alt | `rgba(0,0,0,0.6)` | - | Paragraph text alternative |
| Light Gray BG | `#EFEFEF` | rgb(239, 239, 239) | Page background (marketing) |
| Card BG | `#D7D7D7` | rgb(215, 215, 215) | Card/section backgrounds |
| Border | `#E5E5E5` | rgb(229, 229, 229) | Input borders, dividers (app) |
| Secondary BG | `#F5F5F5` | rgb(245, 245, 245) | Secondary backgrounds (app) |
| Input BG Alt | `#F3F4F6` | rgb(243, 244, 246) | Form background secondary (app) |
| Accent Light | `#FEF7F5` | rgb(254, 247, 245) | Light orange tint backgrounds |
| Orange Tint BG | `rgba(252,89,40,0.1)` | - | Testimonial quote card bg |
| White | `#FFFFFF` | rgb(255, 255, 255) | App background, text on dark bg |

### Semantic Colors (App)

| Name | CSS Variable | Hex | Usage |
|------|-------------|-----|-------|
| Primary | `--base-primary` | `#FC5A29` | Primary actions, links |
| Background | `--base-background` | `#FFFFFF` | Page background |
| Foreground | `--base-foreground` | `#0A0A0A` | Primary text |
| Border | `--base-border` | `#E5E5E5` | Border color |
| Input | `--base-input` | `#E5E5E5` | Input borders |
| Muted Foreground | `--base-muted-foreground` | `#737373` | Secondary text, placeholders |
| Accent Foreground | `--base-accent-foreground` | `#171717` | Accent text |
| Primary Foreground | `--base-primary-foreground` | `#FAFAFA` | Text on primary bg |
| Secondary | `--base-secondary` | `#F5F5F5` | Secondary surfaces |
| Destructive | `--base-destructive` | `#DC2626` | Error states, destructive actions |
| Sidebar Accent | `--bg-sidebar-accent` | `#EF4444` | Sidebar highlights |
| Link Blue | `--colors-link-light` | `#0A68F3` | Link color in light mode |
| Accent Light | `--accent-light` | `#FEF7F5` | Light accent background |

### White Opacity Variants (Marketing)

| Opacity | Value | Usage |
|---------|-------|-------|
| 100% | `#FFFFFF` | Full white text |
| 60% | `rgba(255,255,255,0.6)` | Secondary text on dark bg |
| 40% | `rgba(255,255,255,0.4)` | Muted text, inactive dots |
| 10% | `rgba(255,255,255,0.1)` | Subtle borders on dark bg |

### Dark Overlay Colors (Marketing)

| Value | Usage |
|-------|-------|
| `rgba(0,0,0,0.5)` | Video overlay |
| `rgba(0,0,0,0.6)` | Body text opacity variant |
| `rgba(0,0,0,0.7)` | Stronger overlay |

---

## 2. Typography

### Font Families

| Font | Context | Weights | Usage |
|------|---------|---------|-------|
| **Uncut Sans** | Marketing site | 400, 500, 600, 700 | Primary font for headings & body on marketing site |
| **Inter Display** | Marketing site | 400 | Navigation items |
| **Geist** | App (live.app) | 400, 500, 700 | All text in the application |

CSS variable for app font: `--font-geist: "Geist", sans-serif`

### Typography Scale - Marketing Site

| Element | Size | Weight | Line Height | Transform | Letter Spacing | Color |
|---------|------|--------|-------------|-----------|---------------|-------|
| H1 (Hero) | 64px | 600 | 1.2 (76.8px) | capitalize | normal | `#080808` |
| H2 (Section) | 54px | 600 | 1.2 (64.8px) | capitalize | normal | `#000000` |
| H2 (Stats) | 60px | 700 | normal | none | normal | `#FC5928` (orange) |
| H2 (Footer CTA) | 48px | 500 | normal | uppercase | -1.9px | `#FFFFFF` |
| H3 (Card Title) | 24px | 600 | 1.2 (28.8px) | none | normal | `#000000` |
| H4 (Feature) | 24px | 600 | 1.4 (33.6px) | none | normal | `#000000` |
| H5 (Label/Tag) | 12px | 600 | normal | uppercase | 0.6px | `#FFFFFF` |
| Body | 14px | 400 | 20px | none | normal | `#686868` |
| Body (Large) | 16px | 400 | 1.2 (19.2px) | none | normal | `rgba(0,0,0,0.6)` |
| Nav Items | 16px | 500 | normal | none | normal | `#FFFFFF` |
| Button Text | 18px | 500 | normal | none | normal | varies |
| Small/Caption | 12px | 600 | normal | uppercase | 0.6px | `#FFFFFF` |

### Typography Scale - Application

| Element | Size | Weight | Line Height | Color |
|---------|------|--------|-------------|-------|
| H2 | 30px | 700 | 36px | `#0A0A0A` |
| Body | 14px | 400 | 20px | `#0A0A0A` |
| Small / Muted | 14px | 400 | 20px | `#737373` |
| Input Labels | 14px | 500 | 20px | `#0A0A0A` |
| Button Text | 14px | 500 | 20px | `#FAFAFA` |
| Links | 14px | 400 | 20px | `#FC5A29` (underlined) |

---

## 3. Component Patterns

### Buttons - Marketing Site

| Variant | Background | Text Color | Border | Radius | Padding | Font Size | Weight |
|---------|-----------|------------|--------|--------|---------|-----------|--------|
| **Primary CTA** | `#FC5928` | `#FFFFFF` | none | 4px | 12px 28px | 18px | 500 |
| **Secondary CTA** | `#000000` | `#FFFFFF` | none | 4px | 12px 20px | 18px | 500 |
| **Outline** | transparent | `#FFFFFF` | 1px solid white | 4px | 12px 28px | 18px | 500 |
| **Nav Sign Up** | `#000000` | `#FFFFFF` | none | 4px | 5px 20px | 16px | 500 |
| **Pill Submit** | `#FFFFFF` | `#252525` | none | 100px | 13px 24px | 14px | 500 (uppercase) |

### Buttons - Application

| Variant | Background | Text Color | Border | Radius | Padding | Font Size | Weight |
|---------|-----------|------------|--------|--------|---------|-----------|--------|
| **Primary** | `#FC5A29` | `#FAFAFA` | none | 8px | 8px 16px | 14px | 500 |

### Form Inputs - Application

| Property | Value |
|----------|-------|
| Border | 1px solid `#E5E5E5` |
| Border Radius | 10px (`--radius: 0.625rem`) |
| Height | 36px |
| Font Size | 14px |
| Font Family | Geist |
| Placeholder Color | `#737373` |
| Background | `#FFFFFF` |
| Focus Ring | Arda Orange (`#FC5A29`) accent |

### Form Inputs - Marketing (Email Signup)

| Property | Value |
|----------|-------|
| Border | 1px solid `#FC5928` (orange) |
| Border Radius | 100px (pill shape) |
| Padding | 13px 24px |
| Background | `#FC5928` (orange) with white placeholder text |
| Font Size | 14px |

### Cards (Marketing - Feature Cards)

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border Radius | 12px |
| Padding | 20-24px |
| Box Shadow | `rgba(0,0,0,0.05) 0px 0px 4px 2px` |
| Title | 24px, weight 600 |
| Body | 14px, weight 400, color `#686868` |

### Testimonial Card (Marketing)

| Property | Value |
|----------|-------|
| Quote Background | `rgba(252, 89, 40, 0.1)` (10% orange tint) |
| Quote Border Radius | 20px |
| Quote Text | 18-20px, weight 500, color `#333333` |
| Stat Numbers | 60px, weight 700, color `#FC5928` |
| Stat Labels | 14px, weight 400, color `#333333` |

### Tags / Badges (Marketing)

| Property | Value |
|----------|-------|
| Background | `#000000` |
| Text Color | `#FFFFFF` |
| Font Size | 12px |
| Font Weight | 600 |
| Text Transform | uppercase |
| Letter Spacing | 0.6px |
| Border Radius | 50px (pill) |
| Padding | 8px 16px |

---

## 4. Spacing System

### App Spacing Variables

| Variable | Value |
|----------|-------|
| `--spacing-1` | 4px |
| `--spacing-2` | 8px |
| `--spacing-3` | 12px |
| `--spacing-4` | 16px |
| `--spacing-5` | 20px |
| `--spacing-6` | 24px |

### Marketing Site Spacing Patterns

| Context | Value |
|---------|-------|
| Section margin (between sections) | 48px |
| Section vertical padding | 60-70px |
| Content max-width | 800px |
| Header height | 82px |
| Header padding | 24px 0px |
| Card gap | 16-20px |
| Button internal padding (primary) | 12px 28px |
| Button internal padding (secondary) | 12px 20px |
| Feature card padding | 20-24px |

---

## 5. Border Radii

| Value | Usage |
|-------|-------|
| 4px | Marketing buttons |
| 8px | App buttons, small cards |
| 10px (0.625rem) | App inputs (`--radius`) |
| 12px | Feature cards |
| 20px | Testimonial cards, large cards |
| 40px | Image containers |
| 50px | Tags/badges |
| 100px | Pill buttons, email input |
| 100% | Circular elements (dots, avatars) |

---

## 6. Shadows

| Name | Value | Usage |
|------|-------|-------|
| Card Shadow | `rgba(0,0,0,0.05) 0px 0px 4px 2px` | Feature cards |
| Elevated Shadow | `rgba(0,15,20,0.1) 0px 4px 8px 0px` | Elevated cards, dropdowns |

---

## 7. Layout & Structure

### Header (Marketing)
- Background: `#000000` (black)
- Height: 82px
- Logo: White "Arda" text mark, ~90x51px SVG
- Nav items: White text, 16px, weight 500, Inter Display font
- CTA buttons: "Book a Demo" (outline white border) + "Start Free Trial" (orange bg)

### Hero Section
- Background: `#FFFFFF` (white)
- H1: 64px, weight 600, capitalize, Uncut Sans
- Body text: 16px, weight 400, color `#333333`
- Primary CTA: Orange bg button
- Secondary CTA: Black bg button with play icon
- Hero image: Right-aligned product screenshot

### Content Sections
- Background alternates: `#FFFFFF`, `#EFEFEF`, `#000000` (dark)
- Max content width: ~800px centered
- Section padding: 60-70px vertical

### Footer
- Background: Dark textured (near-black with subtle pattern overlay)
- CTA section: Large uppercase text (48px), email signup form with pill-shaped input
- Footer nav: White text, 14px
- Social icons: YouTube, LinkedIn, Instagram, TikTok
- Logo: White "Arda" text mark

### App Sign-in Layout
- Split layout: Left half solid orange (`#FC5A29`) with subtle geometric overlay, right half white
- Logo: Small Arda logo top-left on orange panel
- Form: Right panel, vertically centered
- Clean, minimal aesthetic

---

## 8. Logo

- **Type**: Text mark "Arda" in a custom typeface
- **Marketing header**: White text on black background, ~90x51px
- **App sign-in**: Small white logo on orange background
- **Footer**: White text on dark background
- **SVG source**: Hosted on Webflow CDN
- **URL**: `https://cdn.prod.website-files.com/67b7700312bb763ca2083376/67d8f47e39f1d93eb2a4613a_67c15beb342cca336fd62ea1_arda_logo_large_background%20(1)%201.svg`

---

## 9. Visual Style & Brand Identity

### Overall Aesthetic
- **Bold and industrial**: The brand targets manufacturers/shop floor workers
- **High contrast**: Black headers and dark sections with bright orange accents
- **Capitalized headings**: Major headings use `text-transform: capitalize`
- **Clean and functional**: Minimal decorative elements, emphasis on clarity
- **Trust signals**: Customer logos (SpaceX, GM, Bella+Canvas), stat numbers, testimonials

### Key Design Principles
1. **Orange as the hero color**: Used sparingly but always for the most important actions and metrics
2. **Black for authority**: Secondary CTAs and navigation use black to convey professionalism
3. **Gray backgrounds for separation**: Alternating white and light gray sections create visual rhythm
4. **Large stat numbers**: Key metrics displayed prominently in orange at 60px with bold weight
5. **Pill shapes for secondary inputs**: Email signup and tags use fully-rounded borders
6. **Geometric patterns**: The app sign-in page uses subtle geometric overlays on the orange panel

### Tailwind-Compatible Color Tokens (App)

```
--tailwind-colors-gray-50: #f9fafb
--tailwind-colors-gray-100: #f3f4f6
--tailwind-colors-gray-200: #e5e7eb
--tailwind-colors-gray-300: #d1d5db
--tailwind-colors-gray-400: #9ca3af
--tailwind-colors-gray-500: #6b7280
--tailwind-colors-gray-600: #4b5563
--tailwind-colors-gray-700: #374151
--tailwind-colors-gray-800: #1f2937
--tailwind-colors-gray-900: #111827
--tailwind-colors-red-100: #fee2e2
--tailwind-colors-indigo-100: #e0e7ff
--tailwind-colors-lime-100: #ecfccb
```

---

## 10. Quick Reference - Key Values

For quick implementation, here are the most critical values:

```css
/* Primary Brand Color */
--arda-orange: #FC5A29;

/* Core Palette */
--black: #000000;
--near-black: #0A0A0A;
--dark-text: #333333;
--medium-gray: #686868;
--light-bg: #EFEFEF;
--border: #E5E5E5;
--white: #FFFFFF;
--accent-light: #FEF7F5;
--error: #DC2626;
--link-blue: #0A68F3;

/* Fonts */
--font-primary-marketing: "Uncut Sans", sans-serif;
--font-nav: "Inter Display", sans-serif;
--font-app: "Geist", sans-serif;

/* Spacing */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;

/* Radii */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 20px;
--radius-pill: 100px;
--radius-full: 100%;
```
