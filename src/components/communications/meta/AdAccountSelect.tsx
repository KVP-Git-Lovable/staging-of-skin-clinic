import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MetaAdAccount } from "@/lib/metaScope";

interface Props {
  accounts: MetaAdAccount[];
  value: string;
  onChange: (value: string) => void;
}

/** "Choose Ad Account" filter: every ad account of the connected Meta login, plus All. */
export function AdAccountSelect({ accounts, value, onChange }: Props) {
  const known = value === "all" || accounts.some((a) => a.ad_account_id === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="text-sm font-medium whitespace-nowrap">Choose Ad Account</Label>
      <Select value={known ? value : "all"} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder="All ad accounts" /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">All ad accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.ad_account_id} value={a.ad_account_id}>
              {a.name} <span className="text-xs text-muted-foreground">act_{a.ad_account_id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
