import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchSelectOption {
  value: string;
  label: string;
  keywords?: string;
  hint?: string;
}

interface Props {
  options: SearchSelectOption[];
  value?: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "選擇...",
  searchPlaceholder = "搜尋...",
  emptyText = "無資料",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const opt = options.find((o) => o.value === itemValue);
            const hay = `${opt?.label ?? ""} ${opt?.keywords ?? ""} ${opt?.hint ?? ""}`.toLowerCase();
            return hay.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground truncate">{o.hint}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
