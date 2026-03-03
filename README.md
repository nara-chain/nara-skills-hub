# Nara Skill Hub

A Solana program (Anchor 0.32.1) that acts as a global registry for **agent skills** — prompt texts that teach AI agents how to perform tasks. Skill names are globally unique. The program supports descriptions, authority transfers, and resumable chunked uploads for large content.

**Program ID:** `54CFypri3UxCawUCLNvFebvpE1qWssKmVfk7RoKzLTkU`

---

## Design Principles

- **Client-allocated large accounts** — `SkillContent` and `SkillBuffer` are created by the client via `system_program::create_account`, avoiding the 10 KB CPI realloc limit.
- **Fixed-header structs, raw trailing bytes** — no `Vec<u8>` fields; content bytes are written directly after the header at a known offset.
- **Resumable uploads** — `write_to_buffer` enforces a strict sequential offset, enabling the client to resume from the last acknowledged `write_offset` after a failed transaction.
- **One active buffer per skill** — a new buffer cannot be initialized until the existing one is closed or finalized.

---

## Account Structures

### `SkillRecord` — PDA
seeds: `[b"skill", name.as_bytes()]`

Small metadata account created by the program. Holds the authority, a pointer to the active `SkillContent` account, and an optional pending-buffer pointer.

| Field | Type | Description |
|-------|------|-------------|
| `authority` | `Pubkey` | Who may update this skill |
| `bump` | `u8` | PDA bump |
| `name` | `String` | Globally unique name (max 32 bytes) |
| `pending_buffer` | `Option<Pubkey>` | Active upload buffer, if any |
| `content` | `Pubkey` | Current `SkillContent` account (`Pubkey::default` = none) |

### `SkillContent` — client-created keypair
Fixed header (72 bytes) + raw content bytes.

| Offset | Field | Size |
|--------|-------|------|
| 0 | discriminator | 8 |
| 8 | `authority` | 32 |
| 40 | `skill` (SkillRecord pubkey) | 32 |
| 72 | raw content bytes | `content_len` |

Required size: `SkillContent::required_size(content_len)` = `72 + content_len`

### `SkillDescription` — PDA
seeds: `[b"desc", skill_record.key().as_ref()]`

Short one-sentence description. Always allocated at max size (525 bytes) so updates never need realloc.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump |
| `description` | `String` | Max 512 bytes |

### `SkillBuffer` — client-created keypair (zero-copy)
Fixed header (80 bytes) + raw data bytes. Uses `#[account(zero_copy)]` for efficient field access.

| Offset | Field | Size |
|--------|-------|------|
| 0 | discriminator | 8 |
| 8 | `authority` | 32 |
| 40 | `skill` (SkillRecord pubkey) | 32 |
| 72 | `total_len` | 4 |
| 76 | `write_offset` | 4 |
| 80 | raw data bytes | `total_len` |

Required size: `SkillBuffer::required_size(total_len)` = `80 + total_len`

---

## Instructions

| # | Instruction | Description |
|---|-------------|-------------|
| 1 | `register_skill(name)` | Creates a `SkillRecord` PDA; name must be ≤ 32 bytes |
| 2 | `set_description(name, description)` | Creates or updates the `SkillDescription` PDA; description must be ≤ 512 bytes |
| 3 | `transfer_authority(name, new_authority)` | Transfers ownership; no pending buffer allowed |
| 4 | `init_buffer(name, total_len)` | Initializes a client-preallocated buffer account; writes header via `load_init()` |
| 5 | `write_to_buffer(name, offset, data)` | Writes a chunk at `offset`; offset must equal `write_offset` (strict sequential) |
| 6 | `finalize_skill_new(name)` | Copies buffer → `new_content`; skill must have no existing content |
| 7 | `finalize_skill_update(name)` | Copies buffer → `new_content`, closes `old_content`; skill must have existing content |
| 8 | `close_buffer(name)` | Discards the buffer without finalizing; clears `pending_buffer` |

---

## Typical Workflows

### Create a skill with content

```
1. register_skill(name)
   └─ program creates SkillRecord PDA

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

---

## Error Codes

| Code | Message |
|------|---------|
| `NameTooLong` | Name too long: max 32 bytes |
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

---

## Source Layout

```
programs/nara-skill-hub/src/
├── lib.rs                          — program entry, instruction dispatch
├── error.rs                        — SkillHubError
├── state/
│   ├── mod.rs
│   ├── skill_record.rs
│   ├── skill_content.rs
│   ├── skill_description.rs
│   └── skill_buffer.rs
└── instructions/
    ├── mod.rs
    ├── register_skill.rs
    ├── set_description.rs
    ├── transfer_authority.rs
    ├── init_buffer.rs
    ├── write_to_buffer.rs
    ├── finalize_skill_new.rs
    ├── finalize_skill_update.rs
    └── close_buffer.rs
```

---

## Build & Test

```bash
anchor build
anchor test
```

Requires Rust toolchain `1.89.0` (see `rust-toolchain.toml`) and Anchor CLI 0.32.x.
