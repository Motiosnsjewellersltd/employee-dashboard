import characters from "./quiz-assets/quiz-characters.png";
import lady from "./quiz-assets/customer-lady.png";
import diamonds from "./quiz-assets/diamond-shapes.png";
import jewellery from "./quiz-assets/jewellery-cards.png";
import styles from "./QuizGame.module.css";
import type { QuizVisual } from "@/lib/quizActivityTypes";
export function CustomerScene({ text, character = "lady" }: { text: string; character?: "lady" | "man" | "child" | "cartoon" }) {
  return <div className={styles.customerScene}>{character === "lady" ? <img src={lady.src} alt="Lady customer" className={styles.lady} /> : <span role="img" aria-label={`${character} illustration`} className={styles.character} style={{ backgroundImage: `url(${characters.src})`, backgroundPosition: `${({man:0,child:50,cartoon:100})[character]}% 0` }} />}<div className={styles.speech}><b>Customer:</b> {text}</div></div>;
}
export function QuizSymbol({ visual = "diamond" }: { visual?: QuizVisual }) { return <span className={styles.symbol} aria-hidden="true">{{ diamond: "💎", gold: "💍", scale: "⚖️", customer: "💬", man: "👨", child: "🧒", cartoon: "💎" }[visual]}</span>; }
export function DiamondPhoto({ index }: { index: number }) {
  return <div role="img" aria-label="Diamond shape to identify" className={styles.diamondPhoto} style={{ backgroundImage: `url(${diamonds.src})`, backgroundPosition: `${index % 3 * 50}% ${Math.floor(index / 3) * 100}%` }} />;
}
export function JewelleryPhoto({ index }: { index: number }) {
  const names = ["Gold ring", "Diamond ring", "Diamond studs", "Gold hoops", "Gold bangle", "Gold chain", "Diamond pendant", "Jhumka earrings", "Pearl necklace", "Ruby ring", "Emerald pendant", "Sapphire earrings"];
  return <span role="img" aria-label={names[index] || "Jewellery"} className={styles.jewelleryPhoto} style={{ backgroundImage: `url(${jewellery.src})`, backgroundPosition: `${index % 4 * (100 / 3)}% ${Math.floor(index / 4) * 50}%` }} />;
}
