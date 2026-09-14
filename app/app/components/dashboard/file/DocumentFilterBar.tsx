"use client";

import { FC } from "react";
import { Search } from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "../shared/DateRangePicker";

interface DocumentFilterBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
}

export const DocumentFilterBar: FC<DocumentFilterBarProps> = ({
  searchTerm,
  setSearchTerm,
  dateRange,
  setDateRange,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="relative sm:col-span-2">
        <Search className="absolute left-3 top-2.5 size-3.5 text-muted" />
        <input
          type="text"
          placeholder="Search by name or CID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-9 pl-9 pr-3 bg-black/40 border border-border rounded-lg text-xs text-foreground placeholder-muted focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
      </div>
      
      <DateRangePicker
        range={dateRange}
        setRange={setDateRange}
        placeholder="Filter by date range"
      />
    </div>
  );
};
