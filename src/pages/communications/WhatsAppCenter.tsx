import { Link } from "react-router-dom";
import { FileText, MessageCircle, MessagesSquare, Settings2 } from "lucide-react";
import { WalletBalanceCard } from "@/components/communications/WalletBalanceCard";
import { Card, CardContent } from "@/components/ui/card";

const cards = [
  {
    title: "WhatsApp Templates",
    description: "View the message templates registered for WhatsApp communication and their approval status.",
    icon: FileText,
    to: "/communications/whatsapp/templates",
  },
  {
    title: "WhatsApp Conversations",
    description: "View all WhatsApp chats with patients, including the AI assistant's replies.",
    icon: MessagesSquare,
    to: "/communications/whatsapp/conversations",
  },
  {
    title: "View Configuration",
    description: "Check the sender number, connection status, credentials and webhook.",
    icon: Settings2,
    to: "/communications/whatsapp/config",
  },
];

export default function WhatsAppCenter() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" /> WhatsApp Center
        </h1>
        <p className="page-subtitle">Part of the Communications Center</p>
      </div>

      <WalletBalanceCard />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map(({ title, description, icon: Icon, to }) => (
          <Link key={to} to={to} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-start gap-4 py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
