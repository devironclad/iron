export interface ChangelogItem {
  version: string;
  date: string;
  title: string;
  type: "major" | "minor" | "patch";
  changes: string[];
}

export const CURRENT_VERSION = "1.9.0";

export const CHANGELOG: ChangelogItem[] = [
  {
    version: "1.9.0",
    date: "2026-07-29",
    title: "Classification Field for Auctions & Properties",
    type: "minor",
    changes: [
      "Auctions and Properties: added a new Classification field (PLA / PAA / PMX / PWT) to the Property Attributes section.",
      "Properties: Safety Index and Financial Rating fields (previously Auctions-only) now also appear in the Acquisition & Development tab."
    ]
  },
  {
    version: "1.8.0",
    date: "2026-07-29",
    title: "Partner Ironclad Opportunities, Granular Access & Auction Fields",
    type: "minor",
    changes: [
      "New Properties > Ironclad Opportunities menu: partners can browse Ironclad-owned properties with a simulated, rounded profit projection — real acquisition costs are never exposed to the partner.",
      "Partners can register purchase interest on an Ironclad-owned property directly from the card.",
      "Registering interest automatically opens a Requests ticket (category 'Purchase Interest', assigned to Tamara Nobres) and links it to the interest record.",
      "Interest is auto-resolved (with full history preserved) once the linked request reaches a closed status (Resolved or Cancelled) — no manual action needed.",
      "Property detail page now supports a read-only view for partners opening an Ironclad Opportunity: Development tab hidden, all fields locked, no real financial data loaded.",
      "Staff: new 'Has Purchase Interest' filter and badge on the Ironclad properties view, with a popover listing each interested partner, the date, and a link to their request ticket.",
      "Access Control: 'Access Control Page' permission split into independent 'Profiles & Permissions' and 'User Management' resources, so a profile's view/edit rights on each can now differ.",
      "Auctions: added Safety Index and Financial Rating fields (Low/Medium/High) to the Property Attributes section, managed via the Manager page.",
      "Auctions: Mobile Home Allowed now reuses the existing mh_allowed field shared with Properties instead of a separate flag, keeping a single source of truth across both screens."
    ]
  },
  {
    version: "1.7.0",
    date: "2026-07-03",
    title: "Marketing View, Auction Calendar & Brand Refresh",
    type: "minor",
    changes: [
      "New Properties > Marketing submenu: displays all properties across all partners with partner-level field restrictions (investment, ROI, profit projection tiers).",
      "Access Control updated with 'Properties: Marketing' permission resource (page:properties:all-partners).",
      "Tab-level edit permissions: users with only a specific tab permission (e.g. tab:links) can now save that tab without requiring page-level edit access.",
      "isPartnerView flag unified — Partners and Marketing views share the same field restriction logic across list and detail pages.",
      "Auction Calendar added to Dashboard Researched Assets view: shows upcoming auction dates grouped by county with daily breakdown panel.",
      "Copy Month button on Auction Calendar: copies a plain-text schedule of all auctions in the current month to the clipboard.",
      "Copy button added to Auction and Property cards: exports key fields (address, parcel, size, coordinates, bids, appraisals, links) in emoji-formatted plain text.",
      "Rebranded to Ironclad Tech with navy color palette (#273548); login, sidebar, and UI components updated.",
      "Dashboard: replaced 'Active for auction by week' bar chart with the compact Auction Calendar in the left column.",
      "Performance: dashboard queries optimized and database indexes added for auction_date and id on ls_assets.",
      "auction_date column type changed from timestamp to date to fix ID ordering within the same auction day.",
      "DB index created: idx_ls_assets_auction_date_id on (auction_date ASC, id ASC)."
    ]
  },
  {
    version: "1.6.0",
    date: "2026-06-22",
    title: "Dashboard Drill-Down, Profit Projection in Values & UX Corrections",
    type: "minor",
    changes: [
      "Dashboard now shows only the 3 KPI cards by default; detail sections (Portfolio, Auctions, Requests) expand only when the respective card is clicked.",
      "Auction detail page scroll-spy fixed: sidebar now highlights the active section as the user scrolls (was broken due to useEffect running before content rendered).",
      "Profit Projection bar chart added to Properties Values tab, below the Evolution section, with the same tier rules as the property card (AR vs non-AR, Ironclad vs Partner).",
      "Properties submenu 'Broker' renamed to 'Investors'; page title and subtitle updated to 'Investor Properties' and 'Properties managed by partner Investors.'",
      "Access Control label updated from 'Properties: Broker' to 'Properties: Investors'.",
      "Properties Sales tab: 'IronClad' corrected to 'Ironclad' in the Property Owner dropdown.",
      "Properties Values tab: 'Tax' tab renamed to 'Tax & Fees'.",
      "Marketing tab: '3D Video' field renamed to '3D Video copy' in the Material section.",
      "Auction card button renamed from 'Edit Details' to 'View Details'.",
      "Dashboard label corrections: 'Total Portfolio' → 'Assets in Portfolio', 'Active Asset for Auctions' → 'Researched Assets', 'Open Requests' → 'Active Requests', 'Top Five Asset' → 'Top 5 Next Auctions', 'Assets for auction by week/priority' → 'Active for auction by week/priority'."
    ]
  },
  {
    version: "1.5.0",
    date: "2026-06-12",
    title: "Data Import, Amenities & Bug Fixes",
    type: "minor",
    changes: [
      "Import script now reads record_type from Excel (AUCTION/PROPERTY) instead of hardcoding AUCTION.",
      "ref_id auto-assigned per record_type on import (sequential counters); DB trigger assign_ref_id handles UI inserts.",
      "Property cards now display PRP-0001 format using ref_id instead of internal DB id.",
      "Added id_prop_old field to ls_assets and import script to link legacy system property IDs.",
      "New script import-amenities.js loads 3,682 amenity records from carga_amenities.xlsx via id_prop_old mapping.",
      "New script dry-run.js validates Excel data against DB lookups without inserting.",
      "AR state Profit Projection uses +100/200/300/400% tiers instead of default +40/60/80/100%.",
      "Fixed Properties state filter: was nullifying ls_county embed; now filters via county_id IN (ids for state).",
      "Fixed Auction date display: toLocaleDateString() caused timezone shift (±1 day); now parses UTC date directly.",
      "Fixed import dedup: delete now scoped per record_type to prevent PROPERTY rows being deleted during AUCTION import.",
      "legal_description column changed from VARCHAR(255) to TEXT to support long legal descriptions.",
      "mh_allowed enum values normalized on import (case-insensitive matching to 'Yes'/'No'/'Modular Only').",
      "supabase_schema.sql updated with assign_ref_id trigger and id_prop_old column documentation.",
      "New script import-tax.js loads 245 tax records from Carga_Tax.xlsx via id_prop_old mapping.",
      "New script import-marketing.js loads 55 marketing records from carga_marketing.xlsx via id_prop_old mapping.",
      "ls_asset_marketing table added to schema with 14 link/text fields and CASCADE on asset delete."
    ]
  },
  {
    version: "1.4.0",
    date: "2026-06-05",
    title: "Login Redesign, Properties Split & Auction Buy Flow",
    type: "minor",
    changes: [
      "Login and Set-Password pages redesigned with a split-screen layout: dark branded left panel with feature highlights and a clean form on the right.",
      "Properties nav item split into 'Ironclad' and 'Broker' sub-items with collapsible sidebar navigation.",
      "Access Control updated with separate permissions for 'Properties: Ironclad' and 'Properties: Broker'.",
      "PermissionGuard now supports anyOf prop for OR-based permission checks.",
      "Auction 'Buy' flow now requires entering the paid bid amount before confirming the purchase.",
      "New financial fields added to auctions: paid_bid, sale_price, doc_fees, paid_bid_inv, investment_total_inv, doc_fees_inv, closing_fess_inv.",
      "paid_bid_inv auto-calculated as 1.5× the paid bid amount on purchase confirmation."
    ]
  },
  {
    version: "1.3.0",
    date: "2026-05-27",
    title: "Property Photos, Requests UX & Bug Fixes",
    type: "minor",
    changes: [
      "Property cards now display a lateral photo thumbnail with Next.js Image optimization.",
      "Photo upload added to property edit page (max 1 MB, stored in Supabase Storage).",
      "New request form: fields reordered and property selector unlocked via toggle 'Relate property?'.",
      "Property dropdown in requests now displays in PRP-XXXX format.",
      "Assignees see an in-page banner reminding them to move Open requests to In Progress.",
      "Open and In Progress statuses hidden from the request status change dropdown.",
      "Fixed auth lock race condition in NotificationBell (getUser → getSession).",
      "Fixed silent no-op bug in 'Mark as In Progress' action.",
      "Fixed photo URL cache-buster being permanently stored in the database.",
      "Extracted formatPropId to shared utility — removed 4 duplicate implementations."
    ]
  },
  {
    version: "1.2.0",
    date: "2026-05-18",
    title: "Dashboard & Card Restructuring",
    type: "minor",
    changes: [
      "Target Value now sums Max Bid instead of Market Value for all active auctions.",
      "Reorganized KPI layout: Target Value card swapped with Total Portfolio card.",
      "Restructured Auction and Property grid cards to highlight Auction/Acquisition Date and Size in the footer.",
      "Used standard Hash (#) icon for Parcel Number and Calendar for Case Number.",
      "Added elegant state-grouped legends (e.g. FL, TX) for the County Portfolio Donut Chart.",
      "Removed county slice limit on the Donut Chart so fatias match 100% of portfolio data.",
      "Corrected dashboard title casings and pluralizations to improve overall platform aesthetics.",
      "Fixed React Hooks order bug on the dashboard to eliminate Turbopack runtime console warnings."
    ]
  },
  {
    version: "1.1.0",
    date: "2026-05-16",
    title: "Requests & Access Standardization",
    type: "minor",
    changes: [
      "Standardized Requests module layout to match the Auctions layout.",
      "Created Admin categories for requests in the Manager section.",
      "Added access control settings for Request categories.",
      "Implemented PostgreSQL triggers for auto-calculating due date SLAs based on priority."
    ]
  },
  {
    version: "1.0.0",
    date: "2026-05-10",
    title: "Platform Launch",
    type: "major",
    changes: [
      "Initial launch of the Ironcladgroup dashboard, property manager, and auction tracker.",
      "Integrated real-time database updates powered by Supabase."
    ]
  }
];
