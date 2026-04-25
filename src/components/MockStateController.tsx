import { useEffect, useMemo, useState } from "react";

import type { MainState, SubState } from "@/store/characterStore";
import { useCharacterStore } from "@/store/characterStore";
import { useWorldStore } from "@/store/worldStore";

import "./MockStateController.css";

// ---------------------------------------------------------------------------
// Valid sub-states per main state
// ---------------------------------------------------------------------------

const SUB_STATES: Record<MainState, SubState[]> = {
  working: ["walking-to-work", "working"],
  idle: [
    "standing",
    "wandering",
    "walking-to-sleep",
    "sleeping",
    "change-room",
    "walking-to-sofa",
    "sitting-on-sofa",
  ],
};

export function MockStateController(): JSX.Element {
  const [mainState, setMainState] = useState<MainState>("idle");
  const [subState, setSubState] = useState<SubState>("standing");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const forceCharacterState = useCharacterStore((s) => s.forceCharacterState);
  const characters = useWorldStore((s) => s.worldConfig?.characters ?? []);

  useEffect(() => {
    if (characters.length === 0) {
      if (selectedCharacterId !== "") {
        setSelectedCharacterId("");
      }
      return;
    }

    const hasSelectedCharacter = characters.some(
      (character) => character.id === selectedCharacterId,
    );

    if (!hasSelectedCharacter) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);

  const selectedCharacter = useMemo(
    () =>
      characters.find((character) => character.id === selectedCharacterId) ??
      null,
    [characters, selectedCharacterId],
  );

  const handleMainStateChange = (next: MainState): void => {
    setMainState(next);
    // Reset sub-state to first valid option for the new main state
    setSubState(SUB_STATES[next][0]);
  };

  const handleApply = (): void => {
    if (selectedCharacterId === "") return;

    forceCharacterState(selectedCharacterId, mainState, subState);
  };

  return (
    <div className="mock-state-controller">
      <div className="mock-state-controller__title">Mock state control</div>

      <div className="mock-state-controller__row">
        <label className="mock-state-controller__label" htmlFor="msc-character">
          Character
        </label>
        <select
          id="msc-character"
          className="mock-state-controller__select"
          value={selectedCharacterId}
          onChange={(e) => setSelectedCharacterId(e.target.value)}
          disabled={characters.length === 0}
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mock-state-controller__row">
        <label className="mock-state-controller__label" htmlFor="msc-main">
          State
        </label>
        <select
          id="msc-main"
          className="mock-state-controller__select"
          value={mainState}
          onChange={(e) => handleMainStateChange(e.target.value as MainState)}
        >
          <option value="working">working</option>
          <option value="idle">idle</option>
        </select>
      </div>

      <div className="mock-state-controller__row">
        <label className="mock-state-controller__label" htmlFor="msc-sub">
          Sub-state
        </label>
        <select
          id="msc-sub"
          className="mock-state-controller__select"
          value={subState}
          onChange={(e) => setSubState(e.target.value as SubState)}
        >
          {SUB_STATES[mainState].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mock-state-controller__meta">
        {selectedCharacter?.agentId ?? "No characters available"}
      </div>

      <button
        className="mock-state-controller__apply"
        onClick={handleApply}
        disabled={selectedCharacterId === ""}
      >
        Apply
      </button>
    </div>
  );
}
