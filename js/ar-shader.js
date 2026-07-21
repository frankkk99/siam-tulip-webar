(function () {
  'use strict';
  if (!window.AFRAME) return;

  AFRAME.registerShader('chromakey', {
    schema: {
      src: { type: 'map', is: 'uniform' },
      keyColor: { type: 'color', is: 'uniform', default: '#047EF7' },
      similarity: { type: 'number', is: 'uniform', default: 0.06 },
      smoothness: { type: 'number', is: 'uniform', default: 0.115 },
      spill: { type: 'number', is: 'uniform', default: 0.85 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D src;
      uniform vec3 keyColor;
      uniform float similarity;
      uniform float smoothness;
      uniform float spill;
      varying vec2 vUv;

      void main() {
        vec4 tex = texture2D(src, vUv);
        float sumColor = max(tex.r + tex.g + tex.b, 0.0001);
        float sumKey = max(keyColor.r + keyColor.g + keyColor.b, 0.0001);
        vec3 chroma = tex.rgb / sumColor;
        vec3 keyChroma = keyColor / sumKey;
        float dist = distance(chroma, keyChroma);
        float alpha = smoothstep(similarity, similarity + smoothness, dist);
        if (alpha < 0.018) discard;

        vec3 rgb = tex.rgb;
        float blueDominance = max(0.0, rgb.b - max(rgb.r, rgb.g));
        rgb.b -= blueDominance * (1.0 - alpha) * spill;
        gl_FragColor = vec4(rgb, tex.a * alpha);
      }
    `
  });
})();
