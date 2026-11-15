// Free resources card (ports Invest.jsx:321-333). Static copy, no user input.
export default function ResourcesCard() {
  return (
    <div className="card learn-resources">
      <div className="h3" style={{ marginBottom: 10 }}>Free Resources</div>
      <ul className="learn-resources-list">
        <li><a href="https://zerodha.com/varsity/modules/" target="_blank" rel="noreferrer">Zerodha Varsity</a> — free modules. Suggested order: 1 → 3 → 11 → 7 → 15 → 9 → 2 → 10.</li>
        <li><a href="https://investor.sebi.gov.in" target="_blank" rel="noreferrer">SEBI Investor Website</a> &amp; Saa₹thi app — free tools, calculators, registration checks.</li>
        <li><a href="https://www.nism.ac.in/certifications/" target="_blank" rel="noreferrer">NISM certifications</a> — Series V-A (Mutual Funds), Series VIII (Equity Derivatives) before trading F&amp;O.</li>
        <li>Books: <em>Let's Talk Money</em> (Halan), <em>Coffee Can Investing</em> (Mukherjea), <em>The Psychology of Money</em> (Housel), <em>The Intelligent Investor</em> (Graham).</li>
      </ul>
    </div>
  )
}
