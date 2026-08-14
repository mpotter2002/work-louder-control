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
    WL_SKILLS,
    WL_MCP,
    WL_SIDE_CHAT,
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
#define WL_CODEX_INDICATOR_BRIGHTNESS 45
#define WL_INDICATOR_BRIGHTNESS 80
#define WL_STATUS_BRIGHTNESS 128
#define WL_PERIMETER_FRAME_MS 16
#define WL_PERIMETER_PROFILE_MAX 150

static uint8_t wl_current_status = WL_STATUS_NONE;
static uint32_t wl_status_started;
static uint32_t wl_status_timeout;
static uint32_t wl_maintenance_started;
static uint32_t wl_perimeter_frame_started;
static uint8_t wl_active_lighting_layer = L_FIGMA;

static const uint8_t wl_slot_positions[WL_SLOT_COUNT][2] = {
    {1, 0},
    {2, 0},
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
        WL_LIGHTING_ORBIT,
        11,
        224,
        142,
        227,
        255,
        74,
    },
    [L_CODEX] = {
        WL_LIGHTING_ORBIT,
        137,
        255,
        150,
        234,
        196,
        86,
    },
    [L_PC] = {
        WL_LIGHTING_ORBIT,
        104,
        221,
        146,
        156,
        223,
        102,
    },
    [L_EXTRA] = {
        WL_LIGHTING_ORBIT,
        33,
        255,
        144,
        239,
        208,
        94,
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
        WL_SKILLS,        LCTL(LALT(KC_F)), WL_MCP,           WL_MAINTENANCE,
        WL_SIDE_CHAT,     LGUI(KC_T),       LGUI(KC_N),       WL_PET,
        WL_SIDE_CHAT,     WL_SIDE_CHAT,      LGUI(KC_J),       LSFT(LGUI(KC_E)),
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

static rgb_t wl_scale_rgb(rgb_t color, uint8_t brightness) {
    return (rgb_t){
        .r = ((uint16_t)color.r * brightness) / 255,
        .g = ((uint16_t)color.g * brightness) / 255,
        .b = ((uint16_t)color.b * brightness) / 255,
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

static rgb_t wl_profile_endpoint(
    const wl_lighting_t *lighting,
    bool secondary,
    uint8_t brightness
) {
    return hsv_to_rgb((HSV){
        .h = secondary ? lighting->secondary_hue : lighting->primary_hue,
        .s = secondary ? lighting->secondary_saturation : lighting->primary_saturation,
        .v = brightness,
    });
}

static void wl_write_perimeter_pixel(
    rgb_t *pixels,
    uint8_t led_index,
    const wl_lighting_t *lighting,
    bool secondary,
    uint8_t brightness
) {
    pixels[led_index] = wl_profile_endpoint(lighting, secondary, brightness);
}

static uint8_t wl_perimeter_brightness(uint8_t brightness) {
    if (brightness >= WL_PERIMETER_PROFILE_MAX) {
        return 255;
    }
    return ((uint16_t)brightness * 255) / WL_PERIMETER_PROFILE_MAX;
}

static uint8_t wl_perimeter_crossfade_weight(uint8_t distance) {
    return 255 - ((uint16_t)distance * distance) / 255;
}

static void wl_render_perimeter_heads(
    const wl_lighting_t *lighting,
    uint8_t phase,
    uint8_t head_brightness
) {
    // Crossfade each color head between neighboring LEDs. The two heads remain
    // opposite, preserving dark separation while removing eight-step motion.
    rgb_t pixels[RGBLIGHT_LED_COUNT] = {0};
    uint16_t head_position = (uint16_t)phase * RGBLIGHT_LED_COUNT;
    uint8_t head_index = head_position >> 8;
    uint8_t next_head = (head_index + 1) % RGBLIGHT_LED_COUNT;
    uint8_t mix = head_position & 0xFF;
    uint8_t secondary_head = (head_index + (RGBLIGHT_LED_COUNT / 2)) % RGBLIGHT_LED_COUNT;
    uint8_t secondary_next = (next_head + (RGBLIGHT_LED_COUNT / 2)) % RGBLIGHT_LED_COUNT;
    uint8_t current_weight = wl_perimeter_crossfade_weight(mix);
    uint8_t next_weight = wl_perimeter_crossfade_weight(255 - mix);
    uint8_t current_brightness = ((uint16_t)head_brightness * current_weight) / 255;
    uint8_t next_brightness = ((uint16_t)head_brightness * next_weight) / 255;

    wl_write_perimeter_pixel(pixels, head_index, lighting, false, current_brightness);
    wl_write_perimeter_pixel(pixels, next_head, lighting, false, next_brightness);
    wl_write_perimeter_pixel(pixels, secondary_head, lighting, true, current_brightness);
    wl_write_perimeter_pixel(pixels, secondary_next, lighting, true, next_brightness);

    for (uint8_t led_index = 0; led_index < RGBLIGHT_LED_COUNT; led_index++) {
        rgblight_setrgb_at(
            pixels[led_index].r,
            pixels[led_index].g,
            pixels[led_index].b,
            led_index
        );
    }
}

static void wl_set_perimeter_lighting(const wl_lighting_t *lighting) {
    uint8_t phase = wl_phase(lighting);
    uint8_t head_brightness = wl_perimeter_brightness(lighting->brightness);

    switch (lighting->effect) {
        case WL_LIGHTING_BREATHING: {
            uint8_t pulse = abs8(sin8(phase) - 128) * 2;
            head_brightness = wl_scale_brightness(head_brightness, pulse, 42);
            phase = 0;
            break;
        }
        case WL_LIGHTING_WAVE: {
            head_brightness = wl_scale_brightness(head_brightness, sin8(phase + 64), 58);
            break;
        }
        case WL_LIGHTING_TWINKLE: {
            head_brightness = wl_scale_brightness(
                head_brightness,
                abs8(sin8((phase * 2) + 31) - 128) * 2,
                34
            );
            break;
        }
        case WL_LIGHTING_ORBIT:
            break;
        case WL_LIGHTING_STATIC:
        default:
            phase = 0;
            break;
    }

    wl_render_perimeter_heads(lighting, phase, head_brightness);
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
    rgblight_set_speed_noeeprom(lighting->speed);
    wl_set_perimeter_lighting(lighting);
    wl_perimeter_frame_started = timer_read32();
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
    if (layer == get_highest_layer(layer_state)) {
        wl_apply_lighting_profile(layer);
    }
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
            if (record->event.pressed) {
                register_code16(LCTL(LALT(KC_D)));
            } else {
                unregister_code16(LCTL(LALT(KC_D)));
            }
            return false;
        case WL_SKILLS:
            if (record->event.pressed) {
                tap_code16(LCTL(LALT(KC_S)));
            }
            return false;
        case WL_MCP:
            if (record->event.pressed) {
                tap_code16(LCTL(LALT(KC_M)));
            }
            return false;
        case WL_SIDE_CHAT:
            if (record->event.pressed) {
                tap_code16(LALT(LGUI(KC_S)));
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

    if (timer_elapsed32(wl_perimeter_frame_started) >= WL_PERIMETER_FRAME_MS) {
        wl_set_perimeter_lighting(&wl_lighting_profiles[wl_active_lighting_layer]);
        wl_perimeter_frame_started = timer_read32();
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
        case WL_CMD_SET_LIGHTING_PROFILE: {
            if (length < 13 || data[5] >= WL_LIGHTING_LAYER_COUNT ||
                data[6] >= WL_LIGHTING_EFFECT_COUNT) {
                data[4] = 0xFF;
                break;
            }
            uint8_t lighting_layer = data[5];
            wl_set_lighting_profile(data);
            data[5] = lighting_layer;
            data[6] = wl_lighting_profiles[lighting_layer].effect;
            break;
        }
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
                brightness = wl_scale_brightness(lighting->brightness, focus, 72);
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
        status_color = wl_scale_rgb(status_color, WL_STATUS_BRIGHTNESS);
        rgb_matrix_set_color(status_led, status_color.r, status_color.g, status_color.b);
    }

    for (uint8_t slot = 0; slot < WL_SLOT_COUNT; slot++) {
        rgb_t slot_color;
        uint8_t slot_status = wl_slot_status[slot];
        if (slot_status == WL_STATUS_NONE) {
            slot_status = WL_STATUS_IDLE;
        }
        if (!wl_status_color(slot_status, &slot_color)) {
            continue;
        }
        slot_color = wl_scale_rgb(slot_color, WL_STATUS_BRIGHTNESS);

        uint8_t slot_led =
            g_led_config.matrix_co[wl_slot_positions[slot][0]][wl_slot_positions[slot][1]];
        if (slot_led == NO_LED || slot_led < led_min || slot_led >= led_max) {
            continue;
        }
        rgb_matrix_set_color(slot_led, slot_color.r, slot_color.g, slot_color.b);
    }

    return true;
}

// The three layer indicators sit on timer 1 PWM outputs, so the level written
// by the _on helpers is overridden by OCR1A/B/C. Turning one on needs both the
// output direction from _on and a compare value, and _off returns the pin to
// an input so the PWM signal cannot reach the LED at all.
static void wl_set_indicator(uint8_t indicator, bool on) {
    void (*enable)(void) = NULL;
    void (*disable)(void) = NULL;
    void (*level)(uint8_t) = NULL;

    switch (indicator) {
        case 0:
            enable = work_louder_micro_led_1_on;
            disable = work_louder_micro_led_1_off;
            level = work_louder_micro_led_1_set;
            break;
        case 1:
            enable = work_louder_micro_led_2_on;
            disable = work_louder_micro_led_2_off;
            level = work_louder_micro_led_2_set;
            break;
        default:
            enable = work_louder_micro_led_3_on;
            disable = work_louder_micro_led_3_off;
            level = work_louder_micro_led_3_set;
            break;
    }

    if (on) {
        enable();
        level(indicator == 0 ? WL_CODEX_INDICATOR_BRIGHTNESS : WL_INDICATOR_BRIGHTNESS);
    } else {
        level(0);
        disable();
    }
}

layer_state_t layer_state_set_user(layer_state_t state) {
    wl_set_indicator(0, layer_state_cmp(state, L_CODEX));
    wl_set_indicator(1, layer_state_cmp(state, L_PC));
    wl_set_indicator(2, layer_state_cmp(state, L_EXTRA));
    wl_apply_lighting_profile(get_highest_layer(state));
    return state;
}

void keyboard_post_init_user(void) {
    layer_state_set_user(layer_state);
}
