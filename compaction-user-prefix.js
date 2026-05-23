// Workaround for an opencode bug: when manual/auto compaction runs after a
// previous compaction whose `tail_start_id` landed mid-turn on an assistant
// tool-call, `compaction.process` builds `selected.head` as a chain of
// consecutive assistant tool-call messages with no user message at the start.
//
// `MessageV2.toModelMessagesEffect` faithfully converts that to a model
// message array whose first entry is `assistant tool_use`, which Anthropic
// rejects with: messages.N: `tool_use` ids were found without `tool_result`
// blocks immediately after.
//
// Upstream report: opencode session msg `msg_e5550bcfb001EjDfz6hFE3lpHB`
// (compaction failure on session `ses_1ae999d1dffeOLwEseaIFPDg0V`).
//
// Strategy: at the `experimental.chat.messages.transform` boundary we get
// the same `WithParts[]` opencode is about to pass into `toModelMessages`.
// If the first message is an assistant we prepend a synthetic user "text"
// part. opencode recognises `text` parts in user messages, so the prepended
// turn survives the conversion and the resulting body starts with a user
// message.
//
// Safe on the normal chat path because real chat already begins with a
// user message (`!== "assistant"` short-circuits the prepend).

const NOTE = "Continue from the prior summary above."

export const CompactionUserPrefixPlugin = async (_ctx) => ({
    "experimental.chat.messages.transform": async (_input, output) => {
        const messages = output?.messages
        if (!Array.isArray(messages) || messages.length === 0) return

        const first = messages[0]
        if (first?.info?.role !== "assistant") return

        const sessionID = first.info.sessionID ?? ""
        const stamp = Date.now().toString(36)
        const id = `msg_compaction_prefix_${stamp}`

        messages.unshift({
            info: {
                id,
                sessionID,
                role: "user",
                time: { created: Date.now() },
                agent: first.info.agent ?? "compaction",
                model: {
                    providerID: first.info.providerID ?? "anthropic",
                    modelID: first.info.modelID ?? "claude-opus-4-7",
                },
            },
            parts: [
                {
                    id: `prt_compaction_prefix_${stamp}`,
                    messageID: id,
                    sessionID,
                    type: "text",
                    text: NOTE,
                    synthetic: true,
                },
            ],
        })
    },
})

export default CompactionUserPrefixPlugin
