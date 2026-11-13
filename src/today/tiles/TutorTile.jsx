import { useState } from 'react';
import Tile from '../../ui/Tile.jsx';
import Chip from '../../ui/Chip.jsx';
import './tiles-b.css';

export const DEFAULT_PROMPTS = ['Explain recursion', 'Quiz me on graphs', 'Debug my code'];

export const agentsHref = (q) => (q ? `#/agents?q=${encodeURIComponent(q)}` : '#/agents');

// Tutor tile (sky). Props only. It never sends anything: it navigates to
// /agents?q=<text> and the Agents screen prefills its input (B3-18).
//   prompts: suggested prompt chips
//   onAsk(text): host navigates; when omitted the tile sets location.hash itself
function defaultAsk(text) {
  if (typeof window !== 'undefined') window.location.hash = agentsHref(text).slice(1);
}

export default function TutorTile({ prompts = DEFAULT_PROMPTS, onAsk = defaultAsk, href = '#/agents' }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onAsk(text.trim());
  };
  return (
    <Tile tone="sky" title="Tutor" href={href} className="today-tile today-tile-tutor">
      <div className="tb-chips">
        {prompts.map((p) => (
          <button key={p} type="button" className="tb-chip-btn" onClick={() => onAsk(p)}>
            <Chip>{p}</Chip>
          </button>
        ))}
      </div>
      <form className="tb-ask" onSubmit={submit}>
        <input
          className="tb-ask-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything"
          aria-label="Ask the tutor"
        />
        <button type="submit" className="tb-ask-btn">Ask</button>
      </form>
    </Tile>
  );
}
