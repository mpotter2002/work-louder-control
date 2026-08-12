// Copyright 2026 Michael Potter
// SPDX-License-Identifier: GPL-2.0-or-later

#include QMK_KEYBOARD_H
#include "raw_hid.h"
#include "lib/lib8tion/lib8tion.h"

enum layers {
    L_FIGMA,
    L_CODEX,
    L_PC,
    L_EXTRA,
};

enum custom_keycodes {
    WL_PET = SAFE_RANGE,
    WL_PUSH,
    WL_EFFORT_DOWN,
    WL_EFFORT_UP,
    WL_MAINTENANCE,
    WL_FIGMA,
    WL_VOICE,
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
    WL_CMD_SET_LIGHTING_PROFILE = 0x03,
    WL_CMD_SET_SLOT_STATUS = 0x04,
    WL_CMD_GET_LIGHTING_CAPABILITIES = 0x05,
    WL_CMD_ACTION = 0x80,
};

enum wl_lighting_effect {
    WL_LIGHTING_STATIC,
    WL_LIGHTING_BREATHING,
    WL_LIGHTING_ORBIT,
    WL_LIGHTING_WAVE,
    WL_LIGHTING_TWINKLE,
    WL_LIGHTING_EFFECT_COUNT,
};

enum wl_action {
    WL_ACTION_PUSH = 0x01,
    WL_ACTION_EFFORT_DOWN = 0x02,
    WL_ACTION_EFFORT_UP = 0x03,
    WL_ACTION_FIGMA = 0x04,
};

#define WL_PROTOCOL_ID 0xFE
#define WL_PROTOCOL_VERSION 0x01
#define WL_STATUS_ROW 3
#define WL_STATUS_COL 2
#define WL_REPORT_SIZE 32
#define WL_MAINTENANCE_HOLD_MS 5000
#define WL_LIGHTING_LAYER_COUNT 4
#define WL_SLOT_COUNT 2

static uint8_t wl_current_status = WL_STATUS_NONE;
static uint32_t wl_status_started;
static uint32_t wl_status_timeout;
static uint32_t wl_maintenance_started;
static uint8_t wl_active_lighting_layer = L_FIGMA;

static const uint8_t wl_slot_positions[WL_SLOT_COUNT][2] = {
    {0, 1},
    {0, 2},
};
static uint8_t wl_slot_status[WL_SLOT_COUNT];
static uint32_t wl_slot_started[WL_SLOT_COUNT];
static uint32_t wl_slot_timeout[WL_SLOT_COUNT];

typedef struct {
    uint8_t effect;
    uint8_t primary_hue;
    uint8_t primary_saturation;
    uint8_t brightness;
    uint8_t secondary_hue;
    uint8_t secondary_saturation;
    uint8_t speed;
} wl_lighting_t;

static wl_lighting_t wl_lighting_profiles[WL_LIGHTING_LAYER_COUNT] = {
    [L_FIGMA] = {
        WL_LIGHTING_STATIC,
        11,
        224,
        118,
        191,
        150,
        96,
    },
    [L_CODEX] = {
        WL_LIGHTING_BREATHING,
        145,
        235,
        132,
        187,
        165,
        104,
    },
    [L_PC] = {
        WL_LIGHTING_ORBIT,
        120,
        210,
        118,
        171,
        190,
        112,
    },
    [L_EXTRA] = {
        WL_LIGHTING_WAVE,
        35,
        235,
        112,
        239,
        175,
        96,
    },
};

const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
    [L_FIGMA] = LAYOUT(
        LGUI(KC_T),       KC_V,             KC_P,             WL_MAINTENANCE,
        LSFT(KC_L),       KC_R,             KC_O,             KC_L,
        LALT(KC_A),       LCTL(LALT(KC_V)), LCTL(LALT(KC_H)), LALT(KC_D),
        WL_FIGMA,         KC_F,             KC_C,             TO(L_CODEX)
    ),
    [L_CODEX] = LAYOUT(
        KC_NO,            KC_NO,            KC_NO,            WL_MAINTENANCE,
        LCTL(KC_GRV),     LGUI(KC_N),       LGUI(KC_K),       WL_PET,
        LALT(LGUI(KC_S)), LGUI(KC_T),       KC_ENT,           KC_ESC,
        WL_FIGMA,         WL_VOICE,         WL_PUSH,          TO(L_FIGMA)
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

static void wl_set_slot_status(uint8_t slot, uint8_t status, uint8_t ttl_seconds) {
    if (slot >= WL_SLOT_COUNT) {
        return;
    }
    if (status > WL_STATUS_ERROR) {
        status = WL_STATUS_NONE;
    }

    wl_slot_status[slot] = status;
    wl_slot_started[slot] = timer_read32();
    wl_slot_timeout[slot] = (uint32_t)ttl_seconds * 1000;
}

static bool wl_status_color(uint8_t status, rgb_t *color) {
    switch (status) {
        case WL_STATUS_IDLE:
            *color = (rgb_t){150, 150, 150};
            return true;
        case WL_STATUS_WORKING:
            *color = (rgb_t){20, 184, 255};
            return true;
        case WL_STATUS_NEEDS_INPUT:
            *color = (rgb_t){255, 170, 0};
            return true;
        case WL_STATUS_COMPLETE:
            *color = (rgb_t){0, 255, 70};
            return true;
        case WL_STATUS_ERROR:
            *color = (rgb_t){255, 0, 90};
            return true;
        default:
            return false;
    }
}

static uint8_t wl_blend_channel(uint8_t first, uint8_t second, uint8_t amount) {
    return ((uint16_t)first * (255 - amount) + (uint16_t)second * amount) / 255;
}

static rgb_t wl_blend_rgb(rgb_t first, rgb_t second, uint8_t amount) {
    return (rgb_t){
        .r = wl_blend_channel(first.r, second.r, amount),
        .g = wl_blend_channel(first.g, second.g, amount),
        .b = wl_blend_channel(first.b, second.b, amount),
    };
}

static uint8_t wl_scale_brightness(uint8_t brightness, uint8_t amount, uint8_t floor_percent) {
    uint8_t floor = ((uint16_t)brightness * floor_percent) / 100;
    return floor + ((uint16_t)(brightness - floor) * amount) / 255;
}

static uint8_t wl_phase(const wl_lighting_t *lighting) {
    return (uint8_t)((timer_read32() * (uint32_t)(lighting->speed + 16)) >> 10);
}

static uint8_t wl_led_phase(uint8_t led_index) {
    return ((uint16_t)led_index * 255) / (RGB_MATRIX_LED_COUNT - 1);
}

static uint8_t wl_orbit_focus(uint8_t position, uint8_t phase) {
    uint8_t distance = position - phase;
    if (distance > 127) {
        distance = 255 - distance;
    }
    return 255 - (distance * 2);
}

static rgb_t wl_profile_color(const wl_lighting_t *lighting, uint8_t mix, uint8_t brightness) {
    rgb_t primary = hsv_to_rgb((HSV){
        .h = lighting->primary_hue,
        .s = lighting->primary_saturation,
        .v = brightness,
    });
    rgb_t secondary = hsv_to_rgb((HSV){
        .h = lighting->secondary_hue,
        .s = lighting->secondary_saturation,
        .v = brightness,
    });
    return wl_blend_rgb(primary, secondary, mix);
}

static void wl_apply_lighting_profile(uint8_t layer) {
    if (layer >= WL_LIGHTING_LAYER_COUNT) {
        return;
    }

    const wl_lighting_t *lighting = &wl_lighting_profiles[layer];
    wl_active_lighting_layer = layer;
    rgb_matrix_enable_noeeprom();
    rgb_matrix_mode_noeeprom(RGB_MATRIX_SOLID_COLOR);
    rgb_matrix_sethsv_noeeprom(
        lighting->primary_hue,
        lighting->primary_saturation,
        lighting->brightness
    );
    rgb_matrix_set_speed_noeeprom(lighting->speed);
    rgblight_enable_noeeprom();
    rgblight_mode_noeeprom(RGBLIGHT_MODE_STATIC_LIGHT);
    rgblight_sethsv_noeeprom(
        lighting->primary_hue,
        lighting->primary_saturation,
        lighting->brightness
    );
    rgblight_set_speed_noeeprom(lighting->speed);
}

static void wl_set_lighting_profile(const uint8_t *data) {
    uint8_t layer = data[5];
    uint8_t effect = data[6];

    if (layer >= WL_LIGHTING_LAYER_COUNT || effect >= WL_LIGHTING_EFFECT_COUNT) {
        return;
    }

    wl_lighting_profiles[layer] = (wl_lighting_t){
        .effect = effect,
        .primary_hue = data[7],
        .primary_saturation = data[8],
        .brightness = data[9],
        .secondary_hue = data[10],
        .secondary_saturation = data[11],
        .speed = data[12],
    };
    wl_apply_lighting_profile(layer);
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
        case WL_PET:
            if (record->event.pressed) {
                SEND_STRING("/pet");
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
                tap_code16(LCTL(LALT(KC_DOWN)));
            }
            return false;
        case WL_EFFORT_UP:
            if (record->event.pressed) {
                wl_send_action(WL_ACTION_EFFORT_UP);
                tap_code16(LCTL(LALT(KC_UP)));
            }
            return false;
        case WL_FIGMA:
            if (record->event.pressed) {
                wl_send_action(WL_ACTION_FIGMA);
                tap_code(KC_F15);
            }
            return false;
        case WL_VOICE:
            // Codex listens for a held Ctrl+Shift+D as its press-and-hold
            // dictation gesture, so mirror the physical key state.
            if (record->event.pressed) {
                register_mods(MOD_BIT(KC_LCTL) | MOD_BIT(KC_LSFT));
                register_code(KC_D);
            } else {
                unregister_code(KC_D);
                unregister_mods(MOD_BIT(KC_LCTL) | MOD_BIT(KC_LSFT));
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

    for (uint8_t slot = 0; slot < WL_SLOT_COUNT; slot++) {
        if (wl_slot_status[slot] != WL_STATUS_NONE && wl_slot_timeout[slot] > 0 &&
            timer_elapsed32(wl_slot_started[slot]) >= wl_slot_timeout[slot]) {
            wl_set_slot_status(slot, WL_STATUS_NONE, 0);
        }
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
        case WL_CMD_SET_LIGHTING_PROFILE:
            if (length < 13 || data[5] >= WL_LIGHTING_LAYER_COUNT ||
                data[6] >= WL_LIGHTING_EFFECT_COUNT) {
                data[4] = 0xFF;
                break;
            }
            wl_set_lighting_profile(data);
            data[5] = wl_active_lighting_layer;
            data[6] = wl_lighting_profiles[wl_active_lighting_layer].effect;
            break;
        case WL_CMD_SET_SLOT_STATUS:
            if (data[5] >= WL_SLOT_COUNT) {
                data[4] = 0xFF;
                break;
            }
            wl_set_slot_status(data[5], data[6], data[7]);
            data[7] = wl_slot_status[data[5]];
            break;
        case WL_CMD_GET_LIGHTING_CAPABILITIES:
            data[5] = 1;
            data[6] = WL_LIGHTING_EFFECT_COUNT;
            data[7] = WL_LIGHTING_LAYER_COUNT;
            break;
        default:
            data[4] = 0xFF;
            break;
    }

    raw_hid_send(data, length);
    return true;
}

bool rgb_matrix_indicators_advanced_user(uint8_t led_min, uint8_t led_max) {
    const wl_lighting_t *lighting = &wl_lighting_profiles[wl_active_lighting_layer];
    uint8_t phase = wl_phase(lighting);

    for (uint8_t led_index = led_min; led_index < led_max; led_index++) {
        uint8_t position = wl_led_phase(led_index);
        uint8_t mix = position;
        uint8_t brightness = lighting->brightness;

        switch (lighting->effect) {
            case WL_LIGHTING_BREATHING: {
                uint8_t pulse = abs8(sin8(phase) - 128) * 2;
                mix = phase;
                brightness = wl_scale_brightness(lighting->brightness, pulse, 24);
                break;
            }
            case WL_LIGHTING_ORBIT: {
                uint8_t focus = wl_orbit_focus(position, phase);
                mix = position;
                brightness = wl_scale_brightness(lighting->brightness, focus, 10);
                break;
            }
            case WL_LIGHTING_WAVE: {
                uint8_t wave = sin8(phase + position);
                mix = phase + position;
                brightness = wl_scale_brightness(lighting->brightness, wave, 32);
                break;
            }
            case WL_LIGHTING_TWINKLE: {
                uint8_t sparkle = abs8(sin8((phase * 2) + (led_index * 53)) - 128) * 2;
                mix = (led_index % 2) ? sparkle : 255 - sparkle;
                brightness = wl_scale_brightness(lighting->brightness, sparkle, 8);
                break;
            }
            case WL_LIGHTING_STATIC:
            default:
                break;
        }

        rgb_t color = wl_profile_color(lighting, mix, brightness);
        rgb_matrix_set_color(led_index, color.r, color.g, color.b);
    }

    rgb_t status_color;
    uint8_t status_led = g_led_config.matrix_co[WL_STATUS_ROW][WL_STATUS_COL];
    if (status_led != NO_LED && status_led >= led_min && status_led < led_max &&
        wl_status_color(wl_current_status, &status_color)) {
        rgb_matrix_set_color(status_led, status_color.r, status_color.g, status_color.b);
    }

    for (uint8_t slot = 0; slot < WL_SLOT_COUNT; slot++) {
        rgb_t slot_color;
        if (!wl_status_color(wl_slot_status[slot], &slot_color)) {
            continue;
        }

        uint8_t slot_led =
            g_led_config.matrix_co[wl_slot_positions[slot][0]][wl_slot_positions[slot][1]];
        if (slot_led == NO_LED || slot_led < led_min || slot_led >= led_max) {
            continue;
        }
        rgb_matrix_set_color(slot_led, slot_color.r, slot_color.g, slot_color.b);
    }

    return true;
}

layer_state_t layer_state_set_user(layer_state_t state) {
    layer_state_cmp(state, L_CODEX) ? work_louder_micro_led_1_on() : work_louder_micro_led_1_off();
    layer_state_cmp(state, L_PC) ? work_louder_micro_led_2_on() : work_louder_micro_led_2_off();
    layer_state_cmp(state, L_EXTRA) ? work_louder_micro_led_3_on() : work_louder_micro_led_3_off();
    wl_apply_lighting_profile(get_highest_layer(state));
    return state;
}

void keyboard_post_init_user(void) {
    wl_apply_lighting_profile(get_highest_layer(layer_state));
}
