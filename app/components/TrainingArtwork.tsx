import basics from "./quiz-assets/training-basics.png";
import selection from "./quiz-assets/training-selection-care.png";
import design from "./quiz-assets/training-design-order.png";
import risk from "./quiz-assets/training-safe-risk.png";
import type { TrainingArt } from "@/lib/quizActivityTypes";
import styles from "./QuizGame.module.css";
// Viewports reference the original approved artwork pixels; no redraw or substituted characters.
export const TRAINING_ART_CLIPS: Record<TrainingArt, { image: typeof basics; box: string }> = {
 detectiveWoman: { image: basics, box: "103 271 145 224" },
 thinkingMan: { image: basics, box: "621 280 145 210" },
 scale: { image: basics, box: "1234 211 247 199" },
 customerWoman: { image: selection, box: "71 214 183 224" },
 pointingWoman: { image: design, box: "73 270 151 180" },
 designMan: { image: design, box: "594 302 140 180" },
 orderWoman: { image: design, box: "1193 187 148 132" },
 repairPhoto: { image: selection, box: "600 203 468 258" },
 pearlPhoto: { image: selection, box: "1128 205 475 233" },
 softPouch: { image: selection, box: "1140 565 138 109" },
 mixedTray: { image: risk, box: "58 190 425 395" },
 heavyEarrings: { image: selection, box: "83 552 130 154" },
 lightStuds: { image: selection, box: "238 587 125 118" },
 longEarrings: { image: selection, box: "390 552 134 155" },
 mixedStorage: { image: selection, box: "1299 550 141 126" },
 hardBox: { image: selection, box: "1452 550 140 120" }
};
export default function TrainingArtwork({ art, small = false }: { art: TrainingArt; small?: boolean }) {
 const clip = TRAINING_ART_CLIPS[art];
 return <svg viewBox={clip.box} className={`${styles.trainingArt} ${small ? styles.smallArt : ""}`} role="img" aria-label={art === "scale" ? "Jewellery weighing scale" : art === "repairPhoto" ? "Loose setting example" : art === "pearlPhoto" ? "Pearl necklace" : "Jewellery training illustration"}><image href={clip.image.src} width={clip.image.width} height={clip.image.height} /></svg>;
}
