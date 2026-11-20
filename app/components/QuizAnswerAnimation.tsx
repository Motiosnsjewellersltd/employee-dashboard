"use client";
import styles from "./QuizAnswerAnimation.module.css";
export default function QuizAnswerAnimation({ correct }: { correct: boolean }) {
  return <div className={styles.overlay} aria-hidden="true" data-quiz-animation={correct ? "correct" : "incorrect"}>
    {Array.from({ length: correct ? 26 : 18 }, (_, index) => <span key={index} className={`${styles.piece} ${correct ? index % 3 === 0 ? styles.balloon : styles.confetti : styles.sad}`} style={{ left: `${4 + (index * 37 % 91)}%`, animationDelay: `${index % 7 * 0.09}s`, color: ["#3ca6e6", "#eaa0b3", "#a597dd", "#77c6aa", "#e9bd72"][index % 5], "--drift": `${(index % 2 ? 1 : -1) * (18 + index % 5 * 9)}px`, "--turn": `${index % 2 ? 180 : -180}deg` } as React.CSSProperties}>{correct ? index % 3 === 0 ? "🎈" : index % 3 === 1 ? "🎉" : "✦" : ["😔", "😞", "😢"][index % 3]}</span>)}
  </div>;
}
