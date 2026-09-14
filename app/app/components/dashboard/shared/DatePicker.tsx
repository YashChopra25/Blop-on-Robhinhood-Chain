"use client";

import { FC } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";

interface DatePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  placeholder: string;
}

export const DatePicker: FC<DatePickerProps> = ({ date, setDate, placeholder }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full h-9 justify-start text-left font-normal text-xs bg-black/40 border-border hover:bg-white/[0.02] text-foreground hover:text-foreground rounded-lg cursor-pointer"
        >
          <CalendarIcon className="mr-2 size-3.5 text-muted" />
          {date ? (
            date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-border-strong bg-surface z-50" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-lg border-border"
        />
      </PopoverContent>
    </Popover>
  );
};
