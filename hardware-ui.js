(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { field, launcher } = window.atlasCapabilities;
  power.register('Hardware check', async ({ body, node, button, status }) => {
    body.append(
      node('h2', 'Can this model fit?'),
      node(
        'p',
        'Enter the approximate size of your chosen quantized model weights. This local capacity estimate adds 25% plus 2 GiB for overhead. Context length, backend, caches and other apps can substantially increase memory use; it is not a speed or compatibility guarantee.',
      ),
    );
    const size = field(body, 'Model weight size (GiB)', '4');
    size.type = 'number';
    size.min = '0.1';
    size.max = '1024';
    size.step = '0.1';
    const output = node('div');
    body.append(output);
    button('Check local hardware', async () => {
      const result = await api.hardwareCheck({ modelGiB: Number(size.value) });
      output.replaceChildren(
        node('h3', result.cpu + ' · ' + result.threads + ' logical processors'),
        node('p', result.freeGiB + ' GiB available / ' + result.totalGiB + ' GiB total RAM'),
        node('p', 'Estimated requirement: ' + result.requiredGiB + ' GiB'),
        node(
          'p',
          result.ramFits
            ? 'Available system RAM meets this estimate.'
            : 'Available system RAM is below this estimate. Try smaller weights or close other apps.',
        ),
        node('p', result.gpuNote),
      );
      for (const gpu of result.gpus)
        output.append(
          node(
            'p',
            gpu.name + ' · ' + gpu.freeGiB.toFixed(1) + ' GiB free / ' + gpu.totalGiB.toFixed(1) + ' GiB total VRAM',
          ),
        );
      if (result.gpus.length)
        output.append(
          node(
            'p',
            result.gpuFits
              ? 'One GPU meets the estimated full-offload capacity.'
              : 'No single reported GPU meets full-offload capacity; CPU/partial offload depends on your server.',
          ),
        );
      status.textContent = 'Read from this computer. No models downloaded or servers started.';
    });
  });
  launcher('Models', 'Check local model hardware', 'Hardware check');
})();
