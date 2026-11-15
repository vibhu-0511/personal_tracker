// Exam syllabus data, shared by Exams.jsx and the Home tile data. Pure data: no React.
// Keep identical to the former inline EXAMS in src/tabs/Exams.jsx.
export const EXAMS = [
  {
    id: 'cat',
    name: 'CAT',
    icon: '📐',
    color: '#f59e0b',
    sections: [
      {
        name: 'Quantitative Aptitude',
        topics: ['Arithmetic', 'Algebra', 'Geometry & Mensuration', 'Number Systems', 'Modern Math (P&C, Probability)', 'Trigonometry'],
      },
      {
        name: 'Verbal Ability & Reading Comprehension',
        topics: ['Reading Comprehension', 'Para Jumbles', 'Para Summary', 'Odd Sentence Out', 'Sentence Completion'],
      },
      {
        name: 'Data Interpretation & Logical Reasoning',
        topics: ['Tables & Charts', 'Caselets', 'Arrangements', 'Puzzles', 'Logical Connectives', 'Venn Diagrams'],
      },
    ],
  },
  {
    id: 'cfa',
    name: 'CFA',
    icon: '📊',
    color: '#6ea8fe',
    sections: [
      {
        name: 'Ethics & Professional Standards',
        topics: ['Code of Ethics', 'Standards of Professional Conduct', 'GIPS'],
      },
      {
        name: 'Quantitative Methods',
        topics: ['Time Value of Money', 'Probability', 'Hypothesis Testing', 'Regression'],
      },
      {
        name: 'Economics',
        topics: ['Micro/Macro Economics', 'Monetary & Fiscal Policy', 'International Trade', 'Currency Exchange'],
      },
      {
        name: 'Financial Reporting & Analysis',
        topics: ['Financial Statements', 'Revenue Recognition', 'Inventory', 'Long-lived Assets', 'Taxes'],
      },
      {
        name: 'Corporate Issuers',
        topics: ['Corporate Governance', 'Capital Budgeting', 'Cost of Capital', 'Leverage'],
      },
      {
        name: 'Equity & Fixed Income',
        topics: ['Equity Valuation', 'Industry Analysis', 'Bond Pricing', 'Yield Measures', 'Credit Analysis'],
      },
      {
        name: 'Derivatives & Alternatives',
        topics: ['Forwards & Futures', 'Options', 'Swaps', 'Real Estate', 'Private Equity', 'Hedge Funds'],
      },
      {
        name: 'Portfolio Management',
        topics: ['Portfolio Risk & Return', 'CAPM', 'Asset Allocation', 'IPS'],
      },
    ],
  },
  {
    id: 'gmat',
    name: 'GMAT',
    icon: '🎯',
    color: '#a78bfa',
    sections: [
      {
        name: 'Quantitative Reasoning',
        topics: ['Problem Solving', 'Data Sufficiency', 'Arithmetic', 'Algebra', 'Geometry', 'Word Problems'],
      },
      {
        name: 'Verbal Reasoning',
        topics: ['Reading Comprehension', 'Critical Reasoning', 'Sentence Correction'],
      },
      {
        name: 'Data Insights',
        topics: ['Data Sufficiency', 'Multi-Source Reasoning', 'Table Analysis', 'Graphics Interpretation', 'Two-Part Analysis'],
      },
    ],
  },
]
