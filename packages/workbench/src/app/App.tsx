import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AdminView } from "../widgets/admin/index.ts";
import { KnowledgeReviewView } from "../widgets/knowledge-review/index.ts";
import { SoapStudioView } from "../widgets/soap-studio/index.ts";
import { TrainingView } from "../widgets/training/index.ts";
import { VoiceCaptureView } from "../widgets/voice-capture/index.ts";
import {
  CONTEXT_INSPECTOR_ITEMS,
  DEFAULT_WORKSPACE_NAV_ID,
  resolveChatUiUrl,
  WORKSPACE_NAV_ITEMS,
  type WorkspaceNavId,
} from "./workspace-nav.ts";

/** Voice Capture から SOAP Studio へ引き継ぐ入力素材テキスト（session-local、正式記録へは未反映）。 */
type SoapSeed = { sourceLabel: string; text: string };

export function App() {
  const [activeNavId, setActiveNavId] = useState<WorkspaceNavId>(
    DEFAULT_WORKSPACE_NAV_ID,
  );
  const [soapSeed, setSoapSeed] = useState<SoapSeed | null>(null);

  function handleSendToSoapStudio(text: string, sourceLabel: string) {
    setSoapSeed({ sourceLabel, text });
    setActiveNavId("soap-studio");
  }

  function handleNavSelect(navId: WorkspaceNavId) {
    if (navId === "chat") {
      window.open(resolveChatUiUrl(), "_blank", "noopener,noreferrer");
      return;
    }
    setActiveNavId(navId);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1720px] flex-col gap-4 px-4 py-4 md:px-6">
      <header>
        <Card size="sm">
          <CardHeader>
            <h1 className="text-std-24B-150">WEL Agents Workbench</h1>
          </CardHeader>
        </Card>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-4 min-[1180px]:grid-cols-[280px_minmax(0,1fr)_320px] md:gap-8">
        <nav aria-label="Workspace Nav">
          <Card size="sm">
            <CardContent className="flex flex-col gap-3">
              <p className="font-bold text-muted-foreground text-dns-14N-130">
                Workspace Nav
              </p>
              <ul className="flex flex-col gap-2">
                {WORKSPACE_NAV_ITEMS.map((item) => (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant={item.id === activeNavId ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start",
                        item.id === activeNavId && "font-bold",
                      )}
                      aria-current={
                        item.id === activeNavId ? "page" : undefined
                      }
                      onClick={() => handleNavSelect(item.id)}
                    >
                      {item.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </nav>
        <main className="min-w-0">
          <Card className="overflow-y-auto">
            <CardContent>
              {activeNavId === "soap-studio" ? (
                <SoapStudioView
                  seedText={soapSeed?.text}
                  seedSourceLabel={soapSeed?.sourceLabel}
                  onSeedConsumed={() => setSoapSeed(null)}
                />
              ) : activeNavId === "voice-capture" ? (
                <VoiceCaptureView onSendToSoapStudio={handleSendToSoapStudio} />
              ) : activeNavId === "knowledge-review" ? (
                <KnowledgeReviewView />
              ) : activeNavId === "admin" ? (
                <AdminView />
              ) : activeNavId === "training" ? (
                <TrainingView />
              ) : (
                <ComingSoonView navId={activeNavId} />
              )}
            </CardContent>
          </Card>
        </main>
        <aside aria-label="Context Inspector">
          <Card size="sm">
            <CardContent className="flex flex-col gap-3">
              <p className="font-bold text-muted-foreground text-dns-14N-130">
                Context Inspector
              </p>
              <ul className="flex flex-col gap-2">
                {CONTEXT_INSPECTOR_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="text-std-16N-170 text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

const NAV_LABELS: Record<WorkspaceNavId, string> = {
  chat: "Chat",
  "soap-studio": "SOAP Studio",
  "voice-capture": "Voice Capture",
  "knowledge-review": "Knowledge Review",
  training: "Training",
  admin: "Admin",
};

function ComingSoonView({ navId }: { navId: WorkspaceNavId }) {
  return (
    <>
      <h2>{NAV_LABELS[navId]}</h2>
      <p className="text-muted-foreground text-std-16N-170">準備中です。</p>
    </>
  );
}
