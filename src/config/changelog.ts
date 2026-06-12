export interface ChangelogItem {
  version: string;
  date: string;
  title: string;
  type: "major" | "minor" | "patch";
  changes: string[];
}

export const CURRENT_VERSION = "1.5.0";

export const CHANGELOG: ChangelogItem[] = [
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
