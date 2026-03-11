# Audio Pipeline

## 1. Acoustic Segmentation
The bot closes segments from live PCM streams using silence and duration thresholds. This stage is intentionally acoustic only and never tries to infer meaning inside the Discord process.

## 2. Transcription And Acoustic Profiling
The API forwards the audio file path to the persistent Python worker. The worker:
- keeps `WhisperModel` loaded in memory
- transcribes with `condition_on_previous_text=False`
- enables `vad_filter=True`
- returns plain text, timestamps, detected language, duration, and audio metrics

The current `audioMetrics` payload includes:
- `averageEnergy`
- `peakEnergy`
- `dynamicRange`
- `silenceRatio`
- `speechBursts`
- `voicedRatio`
- `zeroCrossingRate`

## 3. Semantic Merge
The API may temporarily hold a transcript when:
- the text does not end in sentence punctuation
- the segment ended because of max duration
- the tail silence is too short

When the same speaker submits a follow-up segment within `SEMANTIC_MERGE_WINDOW_MS`, the transcripts and audio metrics are merged before analysis and search.

## 4. Dynamic Context Analysis
`ContextAnalyzer` replaces the earlier prototype-tag approach.

It generates:
- `summary`
- `labels`
- `category`
- `mood`
- `primaryTone`
- `primaryContext`
- `topicHints`
- `audioCues`
- metadata buckets for vector filtering

The implementation mixes:
- transcript segmentation into candidate phrases
- embedding-based phrase centrality
- acoustic metrics from the source audio
- structural language cues such as punctuation and pacing

This means the labels are not chosen from one hardcoded static tag list. They are rebuilt per transcript and then normalized into a smaller set of stable metadata buckets for search.

## 5. Embedding
The semantic representation is a structured text block containing:
- summary
- category
- mood
- tone
- context
- labels
- topic hints
- audio cues
- full transcript

This representation is embedded with `@huggingface/transformers`.

## 6. Vector Search
The API queries Chroma using:
1. the semantic representation embedding
2. optional metadata buckets such as delivery style, interaction mode, pause density, and energy level

The normalized score is `1 - distance`, clamped into `[0, 1]`.

## 7. Playback Gate
If similarity is below `SIMILARITY_THRESHOLD`, the API returns `no_match` and the bot plays nothing.

## 8. Review-First Ingestion
For dashboard uploads, the same pipeline runs before vector persistence:
1. upload file
2. transcribe and analyze
3. create `SoundDraft`
4. wait for human review
5. confirm and index

This keeps low-confidence AI metadata editable before Chroma is updated.
