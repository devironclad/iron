"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import "./layout.css";

export function Header() {
  const pathname = usePathname();
  
  // Format title from pathname
  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard";
    const segment = pathname.split("/")[1];
    return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : "Dashboard";
  };

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">{getPageTitle()}</h1>
      </div>
      
      <div className="header-right">
        <button className="header-action" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>
        <button className="header-action" aria-label="Notifications">
          <Bell className="w-5 h-5" />
        </button>
        
        <div className="user-profile">
          <div className="avatar">AD</div>
          <div className="user-info">
            <span className="user-name">Admin User</span>
            <span className="user-role">Administrator</span>
          </div>
        </div>
      </div>
    </header>
  );
}
