import { createPlayerMentionSplitter, type PlayerReference } from "../../common/playerMentions";
import { PlayerLink } from "./links";

export function PlayerMentions({
  text,
  players = [],
}: {
  text: string;
  players?: readonly PlayerReference[];
}) {
  return (
    <>
      {createPlayerMentionSplitter(players)(text).map((part, i) =>
        part.pid === undefined ? part.text : <PlayerLink key={i} pid={part.pid} name={part.text} />,
      )}
    </>
  );
}
