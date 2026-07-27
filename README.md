# JIVELO

Premium AI nutrition navigator running on Next.js / vinext.

## Local development

Prerequisites: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```

## Marketing routes

- `/` — premium homepage and interactive product demo
- `/product` — complete product overview
- `/ai-food-camera` — JIVELO Vision and confidence workflow
- `/what-to-eat` — contextual meal recommendation engine
- `/adaptive-plan` — adaptive energy model and weekly review
- `/pro` — JIVELO Pro for specialists and organisations
- `/pricing` — plans and feature comparison
- `/science` — methodology, limits and future references
- `/recipes` — recipe discovery concept
- `/articles` — editorial journal concept
- `/security` — privacy and security model
- `/privacy` — privacy policy draft structure
- `/terms` — terms draft structure
- `/contact` — contact and early partnership form
- `/login` — login UI prototype
- `/register` — early-access registration UI prototype

Every desktop mega-menu item, mobile navigation item and footer link resolves to one of these routes or a documented section anchor.

## Design system

- `app/globals.css` contains the original homepage tokens and component styling.
- `app/marketing.css` contains the shared premium multi-page system, mega menu, responsive layouts and route-specific visual scenes.
- `app/components/site-chrome.tsx` owns the global header, desktop mega menu, mobile navigation and footer.
- `app/components/marketing-sections.tsx` contains reusable page hero, intro, feature grid and CTA components.

The current food photography uses remote Unsplash images as a visual prototype. Replace approved images with licensed local assets in `/public` before production launch.

## Authentication and forms

Login, registration, contact and waitlist controls are visual product prototypes. Connect them to the production authentication, database and notification services before collecting real user information.

## Validation before merge

Run the following in a networked development environment or repository preview runner:

```bash
npm install
npm run lint
npm test
```

Review desktop and mobile routes, keyboard navigation in the mega menu, form focus states and the responsive layouts before merging the redesign PR.

## Pull request scope

The redesign PR is intentionally limited to the public marketing experience, visual prototypes for access forms, shared navigation and the reusable design system. Backend authentication, database persistence, subscriptions and production image licensing remain separate implementation milestones.

## Included starter infrastructure

The repository retains optional Cloudflare D1 and Drizzle support from the vinext starter. `.openai/hosting.json` declares optional Sites bindings and `vite.config.ts` supports local development.
