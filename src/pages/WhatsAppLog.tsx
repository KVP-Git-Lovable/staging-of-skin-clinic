import { useState } from "react";
import { WhatsAppDeliveryLog } from "@/components/shared/WhatsAppDeliveryLog";
import { WhatsAppConversations } from "@/components/shared/WhatsAppConversations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function WhatsAppLog() {
  const [unread, setUnread] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp Delivery</h1>
        <p className="text-sm text-muted-foreground">Appointment confirmations sent to patients and whether they arrived.</p>
      </div>
      <Tabs defaultValue="delivery">
        <TabsList>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="conversations" className="gap-1.5">
            Conversations
            {/* So a patient waiting on an answer is visible from the Delivery
                tab too, which is the one this page opens on. */}
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-semibold text-success-foreground">
                {unread}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="delivery">
          <WhatsAppDeliveryLog />
        </TabsContent>
        {/* forceMount so the conversations keep counting while the Delivery tab
            is in front - otherwise the badge only appears once somebody has
            already gone looking, which is the thing it exists to save. */}
        <TabsContent value="conversations" forceMount className="data-[state=inactive]:hidden">
          <WhatsAppConversations onUnreadCountChange={setUnread} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
