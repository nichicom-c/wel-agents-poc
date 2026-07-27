import { useState } from "react";

import {
  CONTEXT_INSPECTOR_ITEMS,
  DEFAULT_WORKSPACE_NAV_ID,
  SOAP_STUDIO_CARDS,
  WORKSPACE_NAV_ITEMS,
  type WorkspaceNavId,
} from "./workspace-nav.ts";

export function App() {
  const [activeNavId, setActiveNavId] = useState<WorkspaceNavId>(
    DEFAULT_WORKSPACE_NAV_ID,
  );

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
                  onClick={() => setActiveNavId(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="workbench-main">
          {activeNavId === "soap-studio" ? (
            <SoapStudioView />
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

function SoapStudioView() {
  return (
    <>
      <h2>SOAP Studio</h2>
      <p className="workbench-main-description">
        入力素材から SOAP 下書きと不足確認を作る作業画面
      </p>
      <div className="soap-studio-grid">
        {SOAP_STUDIO_CARDS.map((card) => (
          <section
            key={card.id}
            className="soap-studio-card"
            data-accent={card.accent}
          >
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </section>
        ))}
      </div>
    </>
  );
}

const NAV_LABELS: Record<WorkspaceNavId, string> = {
  chat: "Chat",
  "soap-studio": "SOAP Studio",
  "voice-capture": "Voice Capture",
  "knowledge-review": "Knowledge Review",
  training: "Training",
};

function ComingSoonView({ navId }: { navId: WorkspaceNavId }) {
  return (
    <>
      <h2>{NAV_LABELS[navId]}</h2>
      <p className="workbench-main-description">準備中です。</p>
    </>
  );
}
