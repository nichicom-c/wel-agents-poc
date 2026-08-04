import { useState } from "react";

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
    <div className="workbench-shell">
      <header className="workbench-header">
        <h1>WEL Agents Workbench</h1>
      </header>
      <div className="workbench-body">
        <nav className="workspace-nav" aria-label="Workspace Nav">
          <p className="panel-eyebrow">Workspace Nav</p>
          <ul>
            {WORKSPACE_NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="workspace-nav-item"
                  data-active={item.id === activeNavId}
                  onClick={() => handleNavSelect(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="workbench-main">
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
        </main>
        <aside className="context-inspector" aria-label="Context Inspector">
          <p className="panel-eyebrow">Context Inspector</p>
          <ul>
            {CONTEXT_INSPECTOR_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
      <p className="workbench-main-description">準備中です。</p>
    </>
  );
}
