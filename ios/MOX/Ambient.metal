#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

// The wide light behind the ring on Home, computed per pixel.
//
// A gradient this faint spans only a dozen 8-bit steps, and SwiftUI's
// gradients show each step as a ring. Here every pixel gets a triangular
// dither of about one step, which turns the rings into an invisible grain.
[[ stitchable ]] half4 moxAmbient(
    float2 position, half4 color,
    float2 center, float hole, float rim, float radius, float fade, float strength, float3 tint
) {
    float d = distance(position, center);
    float inner = smoothstep(hole, rim, d);                    // nothing over the ring's black centre
    float fall = exp(-pow(d / radius, 1.4));                   // broad: still ~30% at the screen's corners
    float edge = 1.0 - smoothstep(fade * 0.8, fade, d);        // gone before the layer ends
    float a = strength * inner * fall * edge;

    float n1 = fract(sin(dot(position, float2(12.9898, 78.233))) * 43758.5453);
    float n2 = fract(sin(dot(position, float2(39.3468, 11.1351))) * 24634.6345);
    float dither = (n1 + n2 - 1.0) / 255.0;

    float3 c = max(tint * a + dither * step(0.0001, a), 0.0);
    return half4(half3(c), half(max(c.r, max(c.g, c.b))));
}
