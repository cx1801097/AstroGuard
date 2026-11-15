# GitHub mission console snapshot

Frontend based on `cx1801097/NasaSpaceAppChallangeCCC@2068e56`. The parent home page opens this console under **New mission**. It keeps its own v2 mission record. Its legacy record check does not import the parent console's records.

The integration adds spacecraft and resource fields, a Crew Suggestion column, and a bridge from the existing wearable panel. The bridge passes only readings the operator explicitly selected and confirmed as resting readings. Workout TCX readings remain available for review and export. The saved check retains the sensor's original timestamp and source. The mission navigation links to the separate historical I4 playback and simulated Gemini review. The upstream Assistant still requires its own server and credentials.
