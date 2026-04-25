import { useWorldStore } from "@/store/worldStore";
import { useCharacterStore } from "@/store/characterStore";

import "./InspectorPanel.css";

/**
 * InspectorPanel
 *
 * Renders details about whatever the user has clicked on the map.
 * Reads from Zustand — no props needed.
 */
export function InspectorPanel(): JSX.Element {
  const selection = useWorldStore((s) => s.inspectorSelection);
  const worldConfig = useWorldStore((s) => s.worldConfig);
  const characterStates = useCharacterStore((s) => s.characterStates);

  if (!selection) {
    return (
      <aside className="inspector-panel inspector-panel--empty">
        <p className="inspector-panel__hint">
          Click a character or room on the map
        </p>
      </aside>
    );
  }

  if (selection.type === "character") {
    const charState = characterStates[selection.characterId];
    const charConfig = worldConfig?.characters.find(
      (c) => c.id === selection.characterId,
    );
    const room = worldConfig?.rooms.find(
      (r) => r.id === charState?.currentRoomId,
    );

    return (
      <aside className="inspector-panel">
        <h2 className="inspector-panel__title">
          {charConfig?.name ?? selection.characterId}
        </h2>
        <dl className="inspector-panel__details">
          <dt>Agent ID</dt>
          <dd>{charConfig?.agentId ?? "—"}</dd>
          <dt>State</dt>
          <dd>{charState?.mainState ?? "—"}</dd>
          <dt>Sub-state</dt>
          <dd>{charState?.subState ?? "—"}</dd>
          <dt>Current room</dt>
          <dd>{room?.label ?? charState?.currentRoomId ?? "—"}</dd>
          <dt>Private room</dt>
          <dd>
            {worldConfig?.rooms.find((r) => r.id === charConfig?.privateRoomId)
              ?.label ??
              charConfig?.privateRoomId ??
              "—"}
          </dd>
        </dl>
      </aside>
    );
  }

  if (selection.type === "room") {
    const room = worldConfig?.rooms.find((r) => r.id === selection.roomId);
    const occupants = Object.values(characterStates).filter(
      (s) => s.currentRoomId === selection.roomId,
    );

    return (
      <aside className="inspector-panel">
        <h2 className="inspector-panel__title">
          {room?.label ?? selection.roomId}
        </h2>
        <dl className="inspector-panel__details">
          <dt>ID</dt>
          <dd>{selection.roomId}</dd>
          <dt>Size</dt>
          <dd>{room ? `${room.width} × ${room.height} px` : "—"}</dd>
          <dt>Objects</dt>
          <dd>{room?.objects.length ?? "—"}</dd>
          <dt>Occupants</dt>
          <dd>
            {occupants.length === 0
              ? "Empty"
              : occupants.map((s) => s.characterId).join(", ")}
          </dd>
        </dl>
      </aside>
    );
  }

  if (selection.type === "resource-wall") {
    return (
      <aside className="inspector-panel">
        <h2 className="inspector-panel__title">Resource Wall</h2>
        <p className="inspector-panel__hint">
          Shared files browser — click the resource wall on the map to open.
        </p>
      </aside>
    );
  }

  return <aside className="inspector-panel inspector-panel--empty" />;
}
