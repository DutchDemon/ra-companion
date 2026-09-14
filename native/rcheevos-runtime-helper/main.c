#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "dolphin_memory.h"
#include "rc_error.h"
#include "rc_runtime.h"
#include "rc_version.h"

#ifndef RA_RCHEEVOS_TAG
#define RA_RCHEEVOS_TAG "unknown"
#endif

#define RA_RUNTIME_PROTOCOL_VERSION 1
#define RA_LINE_BUFFER_SIZE 4096
#define RA_DIAGNOSTIC_READ_MAX 64u

static int extract_uint_field(const char* json, const char* field, unsigned long* value) {
  char needle[64];
  const char* cursor;
  char* end;

  if (!json || !field || !value) return 0;
  snprintf(needle, sizeof(needle), "\"%s\"", field);
  cursor = strstr(json, needle);
  if (!cursor) return 0;
  cursor += strlen(needle);
  while (*cursor && isspace((unsigned char)*cursor)) ++cursor;
  if (*cursor != ':') return 0;
  ++cursor;
  while (*cursor && isspace((unsigned char)*cursor)) ++cursor;
  *value = strtoul(cursor, &end, 10);
  return end != cursor;
}

static int extract_string_field(const char* json, const char* field, char* value, size_t value_size) {
  char needle[64];
  const char* cursor;
  size_t written = 0;

  if (!json || !field || !value || value_size == 0) return 0;
  value[0] = '\0';
  snprintf(needle, sizeof(needle), "\"%s\"", field);
  cursor = strstr(json, needle);
  if (!cursor) return 0;
  cursor += strlen(needle);
  while (*cursor && isspace((unsigned char)*cursor)) ++cursor;
  if (*cursor != ':') return 0;
  ++cursor;
  while (*cursor && isspace((unsigned char)*cursor)) ++cursor;
  if (*cursor != '"') return 0;
  ++cursor;

  while (*cursor && *cursor != '"') {
    if (*cursor == '\\') {
      ++cursor;
      if (!*cursor) return 0;
      if (*cursor == 'n') {
        if (written + 1 < value_size) value[written++] = '\n';
      } else if (*cursor == 'r') {
        if (written + 1 < value_size) value[written++] = '\r';
      } else if (*cursor == 't') {
        if (written + 1 < value_size) value[written++] = '\t';
      } else {
        if (written + 1 < value_size) value[written++] = *cursor;
      }
    } else if (written + 1 < value_size) {
      value[written++] = *cursor;
    }
    ++cursor;
  }

  if (*cursor != '"') return 0;
  value[written] = '\0';
  return 1;
}

static void write_json_string(const char* value) {
  const unsigned char* cursor = (const unsigned char*)(value ? value : "");
  putchar('"');
  while (*cursor) {
    switch (*cursor) {
      case '"': fputs("\\\"", stdout); break;
      case '\\': fputs("\\\\", stdout); break;
      case '\b': fputs("\\b", stdout); break;
      case '\f': fputs("\\f", stdout); break;
      case '\n': fputs("\\n", stdout); break;
      case '\r': fputs("\\r", stdout); break;
      case '\t': fputs("\\t", stdout); break;
      default:
        if (*cursor < 0x20) printf("\\u%04x", (unsigned int)*cursor);
        else putchar(*cursor);
        break;
    }
    ++cursor;
  }
  putchar('"');
}

static void write_ready(void) {
  printf("{\"type\":\"ready\",\"protocolVersion\":%d,\"rcheevosVersion\":\"%s\",\"rcheevosTag\":\"%s\",\"runtimeInitialized\":true,\"gameCubeMemoryBridge\":true}\n",
         RA_RUNTIME_PROTOCOL_VERSION, rc_version_string(), RA_RCHEEVOS_TAG);
  fflush(stdout);
}

static void write_response_prefix(unsigned long id, const char* command) {
  printf("{\"type\":\"response\",\"id\":%lu,\"command\":\"%s\",", id, command);
}

static void write_error_response(unsigned long id, const char* command, const char* error) {
  write_response_prefix(id, command);
  fputs("\"ok\":false,\"error\":", stdout);
  write_json_string(error);
  fputs("}\n", stdout);
}

static void write_memory_status(unsigned long id, const char* command, const dolphin_memory_t* memory) {
  char game_code[7] = "";
  int magic = 0;
  int header_ok = dolphin_memory_header(memory, game_code, &magic);

  write_response_prefix(id, command);
  printf("\"ok\":true,\"attached\":%s,\"readOnly\":true,\"pid\":%lu,"
         "\"raAddressStart\":0,\"raAddressEnd\":%u,\"guestBase\":%u,\"memorySize\":%u,",
         dolphin_memory_is_attached(memory) ? "true" : "false",
         (unsigned long)(memory ? memory->pid : 0),
         RA_GAMECUBE_MEMORY_SIZE - 1u,
         RA_GAMECUBE_GUEST_BASE,
         RA_GAMECUBE_MEMORY_SIZE);
  fputs("\"mappingName\":", stdout);
  write_json_string(dolphin_memory_mapping_name(memory));
  fputs(",\"gameCode\":", stdout);
  write_json_string(header_ok ? game_code : "");
  printf(",\"gameCubeMagic\":%s,\"addressModel\":\"ra-logical-equals-shared-offset\"}\n",
         header_ok && magic ? "true" : "false");
}

static void write_read_memory(unsigned long id, const dolphin_memory_t* memory, uint32_t address, uint32_t num_bytes) {
  uint8_t bytes[RA_DIAGNOSTIC_READ_MAX];
  uint32_t index;

  if (num_bytes == 0 || num_bytes > RA_DIAGNOSTIC_READ_MAX) {
    write_error_response(id, "readMemory", "numBytes must be between 1 and 64.");
    return;
  }
  if (!dolphin_memory_read(memory, address, bytes, num_bytes)) {
    write_error_response(id, "readMemory", "Dolphin memory is not attached or the requested range is outside GameCube MEM1.");
    return;
  }

  write_response_prefix(id, "readMemory");
  printf("\"ok\":true,\"address\":%u,\"guestAddress\":%u,\"numBytes\":%u,\"hex\":\"",
         address, RA_GAMECUBE_GUEST_BASE + address, num_bytes);
  for (index = 0; index < num_bytes; ++index) printf("%02X", bytes[index]);
  fputs("\",\"ascii\":\"", stdout);
  for (index = 0; index < num_bytes; ++index) {
    const unsigned char value = bytes[index];
    if (value >= 0x20 && value <= 0x7E && value != '"' && value != '\\') putchar(value);
    else putchar('.');
  }
  fputs("\"}\n", stdout);
}

static int run_memory_self_test(void) {
  uint32_t address = 0;
  uint8_t synthetic[4] = {0x12, 0x34, 0x56, 0x78};
  dolphin_memory_t fake;
  int ok = 0;
  uint32_t value;

  if (!dolphin_memory_guest_to_ra(0x80000000u, &address) || address != 0u) return 0;
  if (!dolphin_memory_guest_to_ra(0x817FFFFFu, &address) || address != 0x017FFFFFu) return 0;
  if (dolphin_memory_guest_to_ra(0x81800000u, &address)) return 0;
  if (RA_GAMECUBE_MEMORY_SIZE != 0x01800000u) return 0;

  dolphin_memory_init(&fake);
  fake.attached = 1;
  fake.view = synthetic;
  value = dolphin_memory_peek_le(&fake, 0, 4, &ok);
  if (!ok || value != 0x78563412u) return 0;
  return 1;
}

static int run_self_test(void) {
  rc_runtime_t runtime;
  int result;
  int parser_success = 1;
  int memory_success;

  rc_runtime_init(&runtime);

  result = rc_runtime_activate_achievement(&runtime, 1, "0xH0000=1", NULL, 0);
  if (result != RC_OK || rc_runtime_get_achievement(&runtime, 1) == NULL) parser_success = 0;

  if (parser_success) {
    rc_runtime_reset(&runtime);
    rc_runtime_deactivate_achievement(&runtime, 1);
    if (rc_runtime_get_achievement(&runtime, 1) != NULL) parser_success = 0;
  }

  rc_runtime_destroy(&runtime);
  memory_success = run_memory_self_test();

  printf("{\"ok\":%s,\"protocolVersion\":%d,\"rcheevosVersion\":\"%s\",\"rcheevosTag\":\"%s\","
         "\"runtimeParser\":%s,\"gameCubeMemoryMapping\":%s,\"readOnlyBridge\":true}\n",
         parser_success && memory_success ? "true" : "false",
         RA_RUNTIME_PROTOCOL_VERSION,
         rc_version_string(),
         RA_RCHEEVOS_TAG,
         parser_success ? "true" : "false",
         memory_success ? "true" : "false");
  return parser_success && memory_success ? 0 : 1;
}

int main(int argc, char** argv) {
  rc_runtime_t runtime;
  dolphin_memory_t dolphin_memory;
  char line[RA_LINE_BUFFER_SIZE];

  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);

  if (argc > 1 && strcmp(argv[1], "--self-test") == 0) return run_self_test();

  rc_runtime_init(&runtime);
  dolphin_memory_init(&dolphin_memory);
  write_ready();

  while (fgets(line, sizeof(line), stdin) != NULL) {
    char command[64];
    unsigned long id = 0;
    size_t length = strlen(line);

    while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) line[--length] = '\0';
    if (length == 0) continue;

    extract_uint_field(line, "id", &id);
    if (!extract_string_field(line, "command", command, sizeof(command))) {
      printf("{\"type\":\"response\",\"id\":%lu,\"ok\":false,\"error\":\"missing-command\"}\n", id);
      continue;
    }

    if (strcmp(command, "ping") == 0) {
      write_response_prefix(id, "ping");
      printf("\"ok\":true,\"protocolVersion\":%d,\"rcheevosVersion\":\"%s\",\"rcheevosTag\":\"%s\"}\n",
             RA_RUNTIME_PROTOCOL_VERSION, rc_version_string(), RA_RCHEEVOS_TAG);
    } else if (strcmp(command, "status") == 0) {
      write_response_prefix(id, "status");
      printf("\"ok\":true,\"runtimeInitialized\":true,\"achievementCount\":%u,\"leaderboardCount\":%u,\"dolphinAttached\":%s}\n",
             runtime.trigger_count, runtime.lboard_count,
             dolphin_memory_is_attached(&dolphin_memory) ? "true" : "false");
    } else if (strcmp(command, "attachDolphin") == 0) {
      unsigned long pid = 0;
      if (!extract_uint_field(line, "pid", &pid) || pid == 0 || pid > 0xFFFFFFFFul) {
        write_error_response(id, "attachDolphin", "A valid Dolphin pid is required.");
      } else if (!dolphin_memory_attach(&dolphin_memory, (uint32_t)pid)) {
        write_error_response(id, "attachDolphin", dolphin_memory_last_error(&dolphin_memory));
      } else {
        write_memory_status(id, "attachDolphin", &dolphin_memory);
      }
    } else if (strcmp(command, "detachDolphin") == 0) {
      dolphin_memory_close(&dolphin_memory);
      write_response_prefix(id, "detachDolphin");
      fputs("\"ok\":true,\"attached\":false}\n", stdout);
    } else if (strcmp(command, "memoryStatus") == 0) {
      write_memory_status(id, "memoryStatus", &dolphin_memory);
    } else if (strcmp(command, "readMemory") == 0) {
      unsigned long address = 0;
      unsigned long num_bytes = 0;
      if (!extract_uint_field(line, "address", &address) || address > 0xFFFFFFFFul ||
          !extract_uint_field(line, "numBytes", &num_bytes) || num_bytes > 0xFFFFFFFFul) {
        write_error_response(id, "readMemory", "address and numBytes are required.");
      } else {
        write_read_memory(id, &dolphin_memory, (uint32_t)address, (uint32_t)num_bytes);
      }
    } else if (strcmp(command, "reset") == 0) {
      rc_runtime_reset(&runtime);
      write_response_prefix(id, "reset");
      fputs("\"ok\":true}\n", stdout);
    } else if (strcmp(command, "shutdown") == 0) {
      write_response_prefix(id, "shutdown");
      fputs("\"ok\":true}\n", stdout);
      break;
    } else {
      printf("{\"type\":\"response\",\"id\":%lu,\"ok\":false,\"error\":\"unsupported-command\"}\n", id);
    }
  }

  dolphin_memory_close(&dolphin_memory);
  rc_runtime_destroy(&runtime);
  return 0;
}
