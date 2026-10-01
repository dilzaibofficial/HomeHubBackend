# Demo seed data

`demoProperties.json` holds 240 demo listings (30 for each of 8 demo accounts, 2 photos each) that the admin panel
inserts when you press **Properties > Seed demo data** (`POST /api/admin/seedDemoProperties`, admin login required).

- Every inserted row carries `seedBatch` / `seedKey`, so pressing the button twice never duplicates and
  **Remove demo data** deletes only these rows (never a real listing, and never one already in an agreement).
- Listing text, prices and locations are generated; the photos are hosted on Cloudinary in the `homehub_demo_seed/` folder.
- Photo source: the Kaggle "House Rooms & Streets Image Dataset" (CC0 / public domain).
