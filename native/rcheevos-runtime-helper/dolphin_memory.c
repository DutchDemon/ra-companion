#include "dolphin_memory.h"

#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

static void set_error(dolphin_memory_t* memory, const char* message) {
  if (!memory) return;
  snprintf(memory->last_error, sizeof(memory->last_error), "%s", message ? message : "");
}

void dolphin_memory_init(dolphin_memory_t* memory) {
  if (!memory) return;
  memset(memory, 0, sizeof(*memory));
}

void dolphin_memory_close(dolphin_memory_t* memory) {
  if (!memory) return;
#ifdef _WIN32
  if (memory->view) {
    UnmapViewOfFile(memory->view);
    memory->view = NULL;
  }
  if (memory->mapping) {
    CloseHandle((HANDLE)memory->mapping);
    memory->mapping = NULL;
  }
#endif
  memory->pid = 0;
  memory->attached = 0;
  memory->mapping_name[0] = '\0';
}

#ifdef _WIN32
static int try_mapping(dolphin_memory_t* memory, const wchar_t* wide_name, const char* display_name) {
  HANDLE mapping;
  void* view;

  mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, wide_name);
  if (!mapping) return 0;

  view = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, (SIZE_T)RA_GAMECUBE_MEMORY_SIZE);
  if (!view) {
    CloseHandle(mapping);
    return 0;
  }

  memory->mapping = mapping;
  memory->view = view;
  memory->attached = 1;
  snprintf(memory->mapping_name, sizeof(memory->mapping_name), "%s", display_name);
  set_error(memory, "");
  return 1;
}
#endif

int dolphin_memory_attach(dolphin_memory_t* memory, uint32_t pid) {
  if (!memory || pid == 0) return 0;
  dolphin_memory_close(memory);
  memory->pid = pid;

#ifdef _WIN32
  {
    wchar_t local_name[96];
    wchar_t plain_name[96];
    char display[96];
    DWORD error_code;

    swprintf(plain_name, sizeof(plain_name) / sizeof(plain_name[0]), L"dolphin-emu.%lu", (unsigned long)pid);
    snprintf(display, sizeof(display), "dolphin-emu.%lu", (unsigned long)pid);
    if (try_mapping(memory, plain_name, display)) return 1;

    swprintf(local_name, sizeof(local_name) / sizeof(local_name[0]), L"Local\\dolphin-emu.%lu", (unsigned long)pid);
    snprintf(display, sizeof(display), "Local\\dolphin-emu.%lu", (unsigned long)pid);
    if (try_mapping(memory, local_name, display)) return 1;

    error_code = GetLastError();
    snprintf(memory->last_error, sizeof(memory->last_error),
             "Could not open Dolphin shared memory read-only (Win32 error %lu).",
             (unsigned long)error_code);
    memory->pid = 0;
    return 0;
  }
#else
  set_error(memory, "Dolphin shared-memory bridge is Windows-only.");
  memory->pid = 0;
  return 0;
#endif
}

int dolphin_memory_is_attached(const dolphin_memory_t* memory) {
  return memory && memory->attached && memory->view;
}

int dolphin_memory_read(const dolphin_memory_t* memory, uint32_t address, void* buffer, uint32_t num_bytes) {
  const uint8_t* source;
  if (!dolphin_memory_is_attached(memory) || !buffer || num_bytes == 0) return 0;
  if (address >= RA_GAMECUBE_MEMORY_SIZE) return 0;
  if (num_bytes > RA_GAMECUBE_MEMORY_SIZE - address) return 0;

  source = (const uint8_t*)memory->view + address;
  memcpy(buffer, source, num_bytes);
  return 1;
}

uint32_t dolphin_memory_peek_le(const dolphin_memory_t* memory, uint32_t address, uint32_t num_bytes, int* ok) {
  uint8_t bytes[4] = {0, 0, 0, 0};
  uint32_t value = 0;
  uint32_t index;

  if (ok) *ok = 0;
  if (num_bytes == 0 || num_bytes > 4) return 0;
  if (!dolphin_memory_read(memory, address, bytes, num_bytes)) return 0;

  for (index = 0; index < num_bytes; ++index) {
    value |= ((uint32_t)bytes[index]) << (index * 8);
  }
  if (ok) *ok = 1;
  return value;
}

int dolphin_memory_guest_to_ra(uint32_t guest_address, uint32_t* ra_address) {
  if (!ra_address) return 0;
  if (guest_address < RA_GAMECUBE_GUEST_BASE || guest_address > RA_GAMECUBE_GUEST_LAST) return 0;
  *ra_address = guest_address - RA_GAMECUBE_GUEST_BASE;
  return 1;
}

int dolphin_memory_header(const dolphin_memory_t* memory, char game_code[7], int* has_gamecube_magic) {
  uint8_t header[0x20];
  int index;

  if (game_code) game_code[0] = '\0';
  if (has_gamecube_magic) *has_gamecube_magic = 0;
  if (!dolphin_memory_read(memory, 0, header, sizeof(header))) return 0;

  if (game_code) {
    for (index = 0; index < 6; ++index) {
      const uint8_t value = header[index];
      game_code[index] = (value >= 0x20 && value <= 0x7E) ? (char)value : '?';
    }
    game_code[6] = '\0';
  }

  if (has_gamecube_magic) {
    *has_gamecube_magic = header[0x1C] == 0xC2 && header[0x1D] == 0x33 &&
                          header[0x1E] == 0x9F && header[0x1F] == 0x3D;
  }
  return 1;
}

const char* dolphin_memory_mapping_name(const dolphin_memory_t* memory) {
  return memory ? memory->mapping_name : "";
}

const char* dolphin_memory_last_error(const dolphin_memory_t* memory) {
  return memory ? memory->last_error : "";
}
