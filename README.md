# Nara Skill Hub

A Solana program (Anchor 0.32.1) that acts as a global registry for **agent skills** — prompt texts that teach AI agents how to perform tasks. Skill names are globally unique. The program supports descriptions, authority transfers, configurable registration fees, and resumable chunked uploads for large content.

**Program ID:** `54CFypri3UxCawUCLNvFebvpE1qWssKmVfk7RoKzLTkU`

---

## Design Principles

- **Client-allocated large accounts** — `SkillContent` and `SkillBuffer` are created by the client via `system_program::create_account`, avoiding the 10 KB CPI realloc limit.
- **Fixed-header structs, raw trailing bytes** — no `Vec<u8>` fields; content bytes are written directly after the header at a known offset.
- **Resumable uploads** — `write_to_buffer` enforces a strict sequential offset, enabling the client to resume from the last acknowledged `write_offset` after a failed transaction.
- **One active buffer per skill** — a new buffer cannot be initialized until the existing one is closed or finalized.
- **Admin-controlled fees** — registration requires a NARA fee set by the admin; fee = 0 means free.

---

## Instructions

| # | Instruction | Description |
|---|-------------|-------------|
| 1 | `init_config()` | One-time program initialization; caller becomes admin, default fee = 1 NARA |
| 2 | `update_admin(new_admin)` | Admin: transfer admin authority |
| 3 | `update_fee_recipient(new_recipient)` | Admin: change the fee collection account |
| 4 | `update_register_fee(new_fee)` | Admin: change the registration fee (lamports; 0 = free) |
| 5 | `register_skill(name, author)` | Creates a `SkillRecord` PDA; name must be ≥ 5 bytes; author is a display name (max 64 bytes); collects registration fee |
| 6 | `set_description(name, description)` | Creates or updates the `SkillDescription` PDA; description must be ≤ 512 bytes |
| 7 | `transfer_authority(name, new_authority)` | Transfers ownership; no pending buffer allowed |
| 8 | `init_buffer(name, total_len)` | Initializes a client-preallocated buffer account |
| 9 | `write_to_buffer(name, offset, data)` | Writes a chunk at `offset`; offset must equal `write_offset` (strict sequential) |
| 10 | `finalize_skill_new(name)` | Copies buffer → `new_content`; skill must have no existing content |
| 11 | `finalize_skill_update(name)` | Copies buffer → `new_content`, closes `old_content`; skill must have existing content |
| 12 | `close_buffer(name)` | Discards the buffer without finalizing; clears `pending_buffer` |
| 13 | `update_metadata(name, data)` | Creates or updates the `SkillMetadata` PDA with arbitrary JSON (max 800 bytes) |
| 14 | `delete_skill(name)` | Closes `SkillRecord`, `SkillDescription`, `SkillMetadata`, and `SkillContent`; returns all rent to authority; name can be re-registered |

---

## Typical Workflows

### One-time setup (first deploy)

```
init_config()
└─ admin = caller, register_fee = 1 NARA, fee_recipient = caller
```

### Create a skill with content

```
1. register_skill(name)
   └─ program creates SkillRecord PDA; registration fee sent to fee_recipient

2. [client] createAccount(bufferKeypair, SkillBuffer::required_size(N), programId)

3. init_buffer(name, N)

4. write_to_buffer(name, 0,    chunk0)
   write_to_buffer(name, len0, chunk1)
   ...

5. [client] createAccount(contentKeypair, SkillContent::required_size(N), programId)

6. finalize_skill_new(name)
   └─ buffer closed, skill.content = contentKeypair
```

### Update existing content

```
1. [client] createAccount(bufferKeypair2, SkillBuffer::required_size(M), programId)

2. init_buffer(name, M)

3. write_to_buffer × K

4. [client] createAccount(newContentKeypair, SkillContent::required_size(M), programId)

5. finalize_skill_update(name)
   └─ old content closed (rent returned), skill.content = newContentKeypair
```

### Resumable upload (after a failed transaction)

```
1. Fetch the buffer account → read write_offset field
2. Resume from write_offset — skip already-written chunks
```

### Discard a buffer and start fresh

```
close_buffer(name)
└─ pending_buffer cleared, buffer rent returned

→ init_buffer(name, newLen) — start a new upload
```

### Delete a skill (and optionally re-register the name)

```
[optional] close_buffer(name)     ← required first if a pending buffer exists

delete_skill(name)
└─ closes SkillRecord + SkillDescription + SkillMetadata + SkillContent
└─ all rent returned to authority
└─ name is now available again

→ register_skill(name, author)    ← re-register with the same name
```

---

## Error Codes

| Code | Message |
|------|---------|
| `NameTooShort` | Name too short: min 5 bytes |
| `DescriptionTooLong` | Description too long: max 512 bytes |
| `Unauthorized` | Unauthorized |
| `OffsetMismatch` | Buffer write offset mismatch: writes must be sequential |
| `WriteOutOfBounds` | Write out of bounds |
| `BufferIncomplete` | Buffer not fully written |
| `PendingBufferExists` | A pending buffer already exists; call close_buffer first |
| `InvalidBufferSize` | Buffer account size does not match total_len |
| `InvalidBufferOwner` | Buffer account must be owned by this program |
| `BufferMismatch` | Buffer account does not match skill.pending_buffer |
| `InvalidContentOwner` | Content account must be owned by this program |
| `InvalidContentSize` | Content account size does not match buffer total_len |
| `ContentMismatch` | old_content account does not match skill.content |
| `ContentAlreadyExists` | Skill already has content; use finalize_skill_update instead |
| `ContentNotFound` | Skill has no existing content; use finalize_skill_new instead |
| `HasPendingBuffer` | Cannot perform this operation while a pending buffer exists |
| `InvalidFeeRecipient` | fee_recipient does not match config.fee_recipient |
| `AuthorTooLong` | Author name too long: max 64 bytes |
| `MetadataTooLong` | Metadata too long: max 800 bytes |

---

## Source Layout

```
programs/nara-skills-hub/src/
├── lib.rs                          — program entry, instruction dispatch
├── error.rs                        — SkillHubError
├── state/
│   ├── mod.rs
│   ├── skill_record.rs
│   ├── skill_content.rs
│   ├── skill_description.rs
│   ├── skill_metadata.rs
│   ├── skill_buffer.rs
│   └── program_config.rs
└── instructions/
    ├── mod.rs
    ├── init_config.rs
    ├── update_admin.rs
    ├── update_fee_recipient.rs
    ├── update_register_fee.rs
    ├── register_skill.rs
    ├── set_description.rs
    ├── transfer_authority.rs
    ├── init_buffer.rs
    ├── write_to_buffer.rs
    ├── finalize_skill_new.rs
    ├── finalize_skill_update.rs
    ├── close_buffer.rs
    ├── update_metadata.rs
    └── delete_skill.rs
```

---

## Build & Test

```bash
anchor build
anchor test
```

Requires Rust toolchain `1.89.0` (see `rust-toolchain.toml`) and Anchor CLI 0.32.x.
