interface CoachCalloutProps {
  label?: string;
  message: string;
}

export function CoachCallout({ label = 'Treinador', message }: CoachCalloutProps) {
  return (
    <aside className="coachCallout" role="status">
      <span aria-hidden="true" className="coachAvatar">
        ♞
      </span>
      <div className="coachSpeechBubble">
        <strong>{label}</strong>
        <p>{message}</p>
      </div>
    </aside>
  );
}
