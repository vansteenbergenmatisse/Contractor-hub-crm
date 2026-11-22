import { STAGES } from "../api/stages";

// The note under a stage column for the cards the board does not draw.
export function StageMore({ stage, count }: { stage: number; count: number }) {
  return <p className={`fd-kmore is-s${stage}`}>{`${count} more in ${STAGES[stage].name}`}</p>;
}
