import { skillTags } from "../skillTags";

export function SkillTags({ ratings, position }: { ratings: readonly number[]; position: string }) {
  const tags = skillTags(ratings, position);
  if (!tags.length) return null;
  return (
    <span className="player-skill-tags" aria-label="Key skills">
      {tags.map((tag) => (
        <abbr
          key={tag.code}
          className="player-skill-tag"
          title={tag.description}
          aria-label={tag.description}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          tabIndex={0}
        >
          {tag.code}
        </abbr>
      ))}
    </span>
  );
}
