#ifndef RA_DOLPHIN_MEMORY_H
#define RA_DOLPHIN_MEMORY_H

#include <stddef.h>
#include <stdint.h>

#define RA_GAMECUBE_MEMORY_SIZE 0x01800000u
#define RA_GAMECUBE_GUEST_BASE 0x80000000u
#define RA_GAMECUBE_GUEST_LAST 0x817FFFFFu

typedef struct dolphin_memory_t {
#ifdef _WIN32
  void* mapping;
  void* view;
#else
  void* mapping;
  void* view;
#endif
  uint32_t pid;
  int attached;
  char mapping_name[96];
  char last_error[256];
} dolphin_memory_t;

void dolphin_memory_init(dolphin_memory_t* memory);
void dolphin_memory_close(dolphin_memory_t* memory);
int dolphin_memory_attach(dolphin_memory_t* memory, uint32_t pid);
int dolphin_memory_is_attached(const dolphin_memory_t* memory);
int dolphin_memory_read(const dolphin_memory_t* memory, uint32_t address, void* buffer, uint32_t num_bytes);
uint32_t dolphin_memory_peek_le(const dolphin_memory_t* memory, uint32_t address, uint32_t num_bytes, int* ok);
int dolphin_memory_guest_to_ra(uint32_t guest_address, uint32_t* ra_address);
int dolphin_memory_header(const dolphin_memory_t* memory, char game_code[7], int* has_gamecube_magic);
const char* dolphin_memory_mapping_name(const dolphin_memory_t* memory);
const char* dolphin_memory_last_error(const dolphin_memory_t* memory);

#endif
