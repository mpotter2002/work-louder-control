// Copyright 2026 Michael Potter
// SPDX-License-Identifier: GPL-2.0-or-later

#include QMK_KEYBOARD_H
#include "raw_hid.h"

enum layers {
    L_FIGMA,
    L_CODEX,
    L_PC,
    L_EXTRA,
};

enum custom_keycodes {
    WL_SKILLS = SAFE_RANGE,
    WL_MCPS,
    WL_PET,
    WL_SIDE,
    WL_PUSH,
    WL_EFFORT_DOWN,
    WL_EFFORT_UP,
    WL_MAINTENANCE,
};

enum wl_status {
    WL_STATUS_NONE,
    WL_STATUS_IDLE,
    WL_STATUS_WORKING,
    WL_STATUS_NEEDS_INPUT,
    WL_STATUS_COMPLETE,
    WL_STATUS_ERROR,
};

enum wl_protocol_command {
    WL_CMD_SET_STATUS = 0x01,
    WL_CMD_PING = 0x02,
    WL_CMD_ACTION = 0x80,
};

enum wl_action {
    WL_ACTION_PUSH = 0x01,
    WL_ACTION_EFFORT_DOWN = 0x02,
    WL_ACTION_EFFORT_UP = 0x03,
};

#define WL_PROTOCOL_ID 0xFE
#define WL_PROTOCOL_VERSION 0x01
#define WL_STATUS_ROW 0
#define WL_STATUS_COL 2
#define WL_REPORT_SIZE 32
#define WL_MAINTENANCE_HOLD_MS 5000

static uint8_t wl_current_status = WL_STATUS_NONE;
static uint32_t wl_status_started;
static uint32_t wl_status_timeout;
static uint32_t wl_maintenance_started;

const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
    [L_FIGMA] = LAYOUT(
        LGUI(KC_T),       KC_V,             KC_P,             WL_MAINTENANCE,
        LSFT(KC_L),       KC_R,             KC_O,             KC_L,
        LALT(KC_A),       LCTL(LALT(KC_V)), LCTL(LALT(KC_H)), LALT(KC_D),
        UG_TOGG,          KC_F,             KC_C,             TO(L_CODEX)
    ),
    [L_CODEX] = LAYOUT(
        KC_NO,            LGUI(KC_N),       WL_PUSH,          WL_MAINTENANCE,
        LCTL(KC_GRV),     WL_SKILLS,        WL_MCPS,          WL_PET,
        WL_SIDE,          KC_TRNS,          KC_TRNS,          KC_TRNS,
        KC_NO,            LGUI(KC_K),       LSFT(LGUI(KC_P)), TO(L_FIGMA)
    ),
    [L_PC] = LAYOUT(
        LCTL(KC_T),       KC_V,             KC_P,             WL_MAINTENANCE,
        LSFT(KC_L),       KC_R,             KC_O,             KC_L,
        LALT(KC_A),       LSFT(LALT(KC_V)), LSFT(LALT(KC_H)), LALT(KC_D),
        KC_NO,            KC_F,             KC_C,             TO(L_EXTRA)
    ),
    [L_EXTRA] = LAYOUT(
        KC_NO,            KC_TRNS,          KC_TRNS,          WL_MAINTENANCE,
        KC_TRNS,          KC_TRNS,          KC_TRNS,          KC_TRNS,
        LSFT(KC_M),       KC_S,             KC_T,             KC_E,
        KC_NO,            LSFT(KC_S),       KC_C,             TO(L_FIGMA)
    ),
};

#if defined(ENCODER_MAP_ENABLE)
const uint16_t PROGMEM encoder_map[][NUM_ENCODERS][NUM_DIRECTIONS] = {
    [L_FIGMA] = {
        ENCODER_CCW_CW(KC_MINS, KC_EQL),
        ENCODER_CCW_CW(LSFT(LGUI(KC_Z)), LGUI(KC_Z)),
    },
    [L_CODEX] = {
        ENCODER_CCW_CW(MS_WHLU, MS_WHLD),
        ENCODER_CCW_CW(WL_EFFORT_DOWN, WL_EFFORT_UP),
    },
    [L_PC] = {
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(LCTL(KC_Z), LCTL(KC_Y)),
    },
    [L_EXTRA] = {
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
    },
};
#endif

static void wl_set_status(uint8_t status, uint8_t ttl_seconds) {
    if (status > WL_STATUS_ERROR) {
        status = WL_STATUS_NONE;
    }

    wl_current_status = status;
    wl_status_started = timer_read32();
    wl_status_timeout = (uint32_t)ttl_seconds * 1000;
}

static void wl_send_action(uint8_t action) {
    uint8_t data[WL_REPORT_SIZE] = {0};

    data[0] = WL_PROTOCOL_ID;
    data[1] = 'W';
    data[2] = 'L';
    data[3] = WL_PROTOCOL_VERSION;
    data[4] = WL_CMD_ACTION;
    data[5] = action;
    raw_hid_send(data, sizeof(data));
}

bool process_record_user(uint16_t keycode, keyrecord_t *record) {
    switch (keycode) {
        case WL_SKILLS:
            if (record->event.pressed) {
                SEND_STRING("List installed skills and what each does.");
                tap_code(KC_ENT);
            }
            return false;
        case WL_MCPS:
            if (record->event.pressed) {
                SEND_STRING("List configured MCP servers and available tools.");
                tap_code(KC_ENT);
            }
            return false;
        case WL_PET:
            if (record->event.pressed) {
                SEND_STRING("/pet");
                tap_code(KC_ENT);
            }
            return false;
        case WL_SIDE:
            if (record->event.pressed) {
                SEND_STRING("/side");
                tap_code(KC_ENT);
            }
            return false;
        case WL_PUSH:
            if (record->event.pressed) {
                wl_send_action(WL_ACTION_PUSH);
                tap_code(KC_F14);
            }
            return false;
        case WL_EFFORT_DOWN:
            if (record->event.pressed) {
                wl_send_action(WL_ACTION_EFFORT_DOWN);
                tap_code(KC_F17);
            }
            return false;
        case WL_EFFORT_UP:
            if (record->event.pressed) {
                wl_send_action(WL_ACTION_EFFORT_UP);
                tap_code(KC_F18);
            }
            return false;
        case WL_MAINTENANCE:
            if (record->event.pressed) {
                wl_maintenance_started = timer_read32();
            } else if (timer_elapsed32(wl_maintenance_started) >= WL_MAINTENANCE_HOLD_MS) {
                reset_keyboard();
            }
            return false;
    }

    return true;
}

void matrix_scan_user(void) {
    if (wl_current_status != WL_STATUS_NONE && wl_status_timeout > 0 &&
        timer_elapsed32(wl_status_started) >= wl_status_timeout) {
        wl_set_status(WL_STATUS_NONE, 0);
    }
}

bool via_command_kb(uint8_t *data, uint8_t length) {
    if (length < 8 || data[0] != WL_PROTOCOL_ID || data[1] != 'W' || data[2] != 'L' ||
        data[3] != WL_PROTOCOL_VERSION) {
        return false;
    }

    switch (data[4]) {
        case WL_CMD_SET_STATUS:
            wl_set_status(data[5], data[6]);
            data[7] = wl_current_status;
            break;
        case WL_CMD_PING:
            data[5] = wl_current_status;
            break;
        default:
            data[4] = 0xFF;
            break;
    }

    raw_hid_send(data, length);
    return true;
}

bool rgb_matrix_indicators_user(void) {
    uint8_t led_index = g_led_config.matrix_co[WL_STATUS_ROW][WL_STATUS_COL];

    if (led_index == NO_LED || wl_current_status == WL_STATUS_NONE) {
        return true;
    }

    switch (wl_current_status) {
        case WL_STATUS_IDLE:
            rgb_matrix_set_color(led_index, 150, 150, 150);
            break;
        case WL_STATUS_WORKING:
            rgb_matrix_set_color(led_index, 0, 80, 255);
            break;
        case WL_STATUS_NEEDS_INPUT:
            rgb_matrix_set_color(led_index, 255, 170, 0);
            break;
        case WL_STATUS_COMPLETE:
            rgb_matrix_set_color(led_index, 0, 255, 70);
            break;
        case WL_STATUS_ERROR:
            rgb_matrix_set_color(led_index, 255, 0, 90);
            break;
    }

    return true;
}

layer_state_t layer_state_set_user(layer_state_t state) {
    layer_state_cmp(state, L_CODEX) ? work_louder_micro_led_1_on() : work_louder_micro_led_1_off();
    layer_state_cmp(state, L_PC) ? work_louder_micro_led_2_on() : work_louder_micro_led_2_off();
    layer_state_cmp(state, L_EXTRA) ? work_louder_micro_led_3_on() : work_louder_micro_led_3_off();
    return state;
}

void keyboard_post_init_user(void) {
    rgb_matrix_enable_noeeprom();
    rgb_matrix_mode_noeeprom(RGB_MATRIX_BREATHING);
    rgblight_enable_noeeprom();
    rgblight_mode_noeeprom(RGBLIGHT_MODE_BREATHING);
}
