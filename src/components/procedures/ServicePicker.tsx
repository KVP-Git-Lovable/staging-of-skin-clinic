import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { OTHERS_VALUE } from "@/lib/othersOption";
import { servicePickerState, type ServiceOption } from "@/lib/servicePicker";
import { optionMatchScore } from "@/lib/optionSearch";

/**
 * The one way to choose a service on a prescription.
 *
 * The new-prescription form and the saved-prescription editor each had their
 * own control - a searchable dropdown on one, a free text box beside a plain
 * dropdown on the other - so writing a prescription looked different depending
 * on where you opened it. The clinic asked for the dropdown, everywhere. Both
 * screens now render this, so they cannot drift apart again.
 */
export interface ServicePickerProps {
  /** The Service Master to choose from. */
  services: ServiceOption[];
  /** What the line records today. */
  serviceId: string | null | undefined;
  serviceName: string | null | undefined;
  /** Open state is held by the caller, keyed by row - see the note below. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A service picked from the master, by its id. */
  onPickMaster: (serviceId: string) => void;
  /** "Others (type manually)" chosen. */
  onChooseOthers: () => void;
  /** The typed name edited. */
  onNameChange: (name: string) => void;
}

export function ServicePicker({
  services,
  serviceId,
  serviceName,
  open,
  onOpenChange,
  onPickMaster,
  onChooseOthers,
  onNameChange,
}: ServicePickerProps) {
  const state = servicePickerState(serviceId, serviceName, services);

  return (
    <>
      {/* Controlled, because an uncontrolled Radix Popover only closes on an
          outside click or Escape - and CommandItem's onSelect is neither.
          Picking a service filled the line and left the list sitting open over
          the form, which is the fault the clinic reported. The caller keys the
          flag by the row's own key, never by its index: removing a line would
          otherwise leave the open flag on whichever row slid up into its place.
          `modal` stays - see SearchableSelect for why dropping it breaks
          scrolling inside a sheet. */}
      <Popover modal open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{state.label || "Select service"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command filter={optionMatchScore}>
            <CommandInput placeholder="Search service..." />
            <CommandList>
              <CommandEmpty>No service found.</CommandEmpty>
              <CommandGroup>
                {services.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name || ""}
                    onSelect={() => {
                      onPickMaster(s.id);
                      onOpenChange(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${state.selectedId === s.id ? "opacity-100" : "opacity-0"}`} />
                    {s.name}
                  </CommandItem>
                ))}
                <CommandItem
                  value="Others"
                  onSelect={() => {
                    onChooseOthers();
                    onOpenChange(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${state.selectedId === OTHERS_VALUE ? "opacity-100" : "opacity-0"}`} />
                  Others (type manually)
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* Shown for an Others line, and for a name the master does not have -
          an imported prescription must still show what it was written as. */}
      {state.showNameInput && (
        <Input
          placeholder="Service / procedure name"
          value={serviceName || ""}
          onChange={(e) => onNameChange(e.target.value)}
        />
      )}
    </>
  );
}
