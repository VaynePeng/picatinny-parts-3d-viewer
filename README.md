# Picatinny Parts 3D Viewer

Three.js based 3D viewer for two printable Picatinny-related plastic parts:

- Plastic case shell
- Ring clamp component

The viewer is built from the supplied dimension drawings and supports manual rotation, zooming, transparent section view, model switching, combined comparison, and view-dependent dimension labels.

## Current Dimensions

### Plastic case

- Outer front/back size: 35 x 35 mm
- External depth: 9 mm
- Internal size: 33 x 33 mm
- Internal height: 7 mm
- Wall thickness: 1 mm
- Front circular hole: Ø16 mm
- Back USB slot: 13 x 4.5 mm
- USB bottom clearance: 1 mm
- USB horizontal margins: 11 / 13 / 11 mm
- Screw holes/posts: 4 x PM2.0 x 5 mm
- Open C-shaped Picatinny slot: upper width 21.4 mm, lower opening 16.0 mm, slot height 5.8 mm, 45 degree bevels

### Ring clamp

- Outer diameter: Ø35 mm
- Inner diameter: Ø31 mm
- Wall thickness: 2 mm
- External depth: 9 mm
- Open C-shaped Picatinny slot matches the case: upper width 21.4 mm, lower opening 16.0 mm, slot height 5.8 mm, 45 degree bevels

## Features

- Three.js model rendering
- Orbit controls for drag-to-rotate, wheel zoom, and right-click pan
- Switch between case, ring clamp, and combined view
- Transparent section mode
- Auto-rotate toggle
- View-dependent 3D dimension labels
- Visible screw holes and USB slot details

## Development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Notes

This is a visual engineering reference model, not a manufacturing-ready CAD file. Dimensions and shapes should be checked against real hardware before printing or machining.
