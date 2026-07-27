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
- `app/marketing.css` contains the shared multi-page system, mega menu and route-specific scenes.
- `app/refinement.css` is the second visual pass: denser composition, refined colours, accurate food-image mapping, light CTA/footer surfaces and responsive polish.
- `app/components/site-chrome.tsx` owns the global header, desktop mega menu, mobile navigation and footer.
- `app/components/marketing-sections.tsx` contains reusable page hero, intro, feature grid and the visual product CTA.

### Typography

- **Onest** is the primary interface and heading family. It provides strong Cyrillic support, compact UI metrics and consistent readability across dashboards, forms and marketing pages.
- **Prata** is used only for selected accent phrases. It adds a premium editorial note without making the SaaS interface decorative or difficult to scan.

### Photography and visual consistency

The visual layer now maps meal names to matching photography categories: salmon, chicken, wraps, pancakes, salad, breakfast and pasta. Data-heavy sections intentionally use purpose-built UI mockups instead of irrelevant stock photographs.

Remote Unsplash files are still prototype assets. Before production launch, download the approved images, verify licences, optimise them and store them under `/public` so the product does not depend on third-party image delivery.

## Authentication and forms

Login, registration, contact and waitlist controls are visual product prototypes. Connect them to the production authentication, database and notification services before collecting real user information.

## Validation before merge

Run the following in a networked development environment or repository preview runner:

```bash
npm install
npm run lint
npm test
```

Review desktop and mobile routes, keyboard navigation in the mega menu, form focus states, image correspondence and responsive layouts before merging the redesign PR.

## Pull request scope

The redesign PR is intentionally limited to the public marketing experience, visual prototypes for access forms, shared navigation and the reusable design system. Backend authentication, database persistence, subscriptions and final production image licensing remain separate implementation milestones.

## Included starter infrastructure

The repository retains optional Cloudflare D1 and Drizzle support from the vinext starter. `.openai/hosting.json` declares optional Sites bindings and `vite.config.ts` supports local development.
