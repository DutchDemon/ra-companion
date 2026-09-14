#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "rc_error.h"
#include "rc_runtime.h"
#include "rc_version.h"

#ifndef RA_RCHEEVOS_TAG
#define RA_RCHEEVOS_TAG "unknown"
#endif

#define RA_RUNTIME_PROTOCOL_VERSION 1
#define RA_LINE_BUFFER_SIZE 4096

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

static void write_ready(void) {
  printf("{\"type\":\"ready\",\"protocolVersion\":%d,\"rcheevosVersion\":\"%s\",\"rcheevosTag\":\"%s\",\"runtimeInitialized\":true}\n",
         RA_RUNTIME_PROTOCOL_VERSION, rc_version_string(), RA_RCHEEVOS_TAG);
  fflush(stdout);
}

static void write_response_prefix(unsigned long id, const char* command) {
  printf("{\"type\":\"response\",\"id\":%lu,\"command\":\"%s\",", id, command);
}

static int run_self_test(void) {
  rc_runtime_t runtime;
  int result;
  int success = 1;

  rc_runtime_init(&runtime);

  result = rc_runtime_activate_achievement(&runtime, 1, "0xH0000=1", NULL, 0);
  if (result != RC_OK || rc_runtime_get_achievement(&runtime, 1) == NULL) {
    success = 0;
  }

  if (success) {
    rc_runtime_reset(&runtime);
    rc_runtime_deactivate_achievement(&runtime, 1);
    if (rc_runtime_get_achievement(&runtime, 1) != NULL) success = 0;
  }

  rc_runtime_destroy(&runtime);

  printf("{\"ok\":%s,\"protocolVersion\":%d,\"rcheevosVersion\":\"%s\",\"rcheevosTag\":\"%s\",\"runtimeParser\":%s}\n",
         success ? "true" : "false",
         RA_RUNTIME_PROTOCOL_VERSION,
         rc_version_string(),
         RA_RCHEEVOS_TAG,
         success ? "true" : "false");
  return success ? 0 : 1;
}

int main(int argc, char** argv) {
  rc_runtime_t runtime;
  char line[RA_LINE_BUFFER_SIZE];

  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);

  if (argc > 1 && strcmp(argv[1], "--self-test") == 0) {
    return run_self_test();
  }

  rc_runtime_init(&runtime);
  write_ready();

  while (fgets(line, sizeof(line), stdin) != NULL) {
    char command[64];
    unsigned long id = 0;
    size_t length = strlen(line);

    while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) {
      line[--length] = '\0';
    }
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
      printf("\"ok\":true,\"runtimeInitialized\":true,\"achievementCount\":%u,\"leaderboardCount\":%u}\n",
             runtime.trigger_count, runtime.lboard_count);
    } else if (strcmp(command, "reset") == 0) {
      rc_runtime_reset(&runtime);
      write_response_prefix(id, "reset");
      printf("\"ok\":true}\n");
    } else if (strcmp(command, "shutdown") == 0) {
      write_response_prefix(id, "shutdown");
      printf("\"ok\":true}\n");
      break;
    } else {
      printf("{\"type\":\"response\",\"id\":%lu,\"ok\":false,\"error\":\"unsupported-command\"}\n", id);
    }
  }

  rc_runtime_destroy(&runtime);
  return 0;
}
