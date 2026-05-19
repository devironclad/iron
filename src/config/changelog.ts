export interface ChangelogItem {
  version: string;
  date: string;
  title: string;
  type: "major" | "minor" | "patch";
  changes: string[];
}

export const CURRENT_VERSION = "1.2.0";

export const CHANGELOG: ChangelogItem[] = [
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
