// All visible presentation copy lives here. Progress values must increase from 0 to 1.
export const presentation = {
  brand: 'Landscape Vision',
  project: 'A landscape, imagined.',
  detail: 'From first lines to living spaces',
  scrollCue: 'Scroll to transform',
  reducedMotionCue: 'Select a stage to explore',
  endCue: 'A vision, brought to life',
  navigationLabel: 'Explore the four design stages',
};

export const stages = [
  { progress: 0, number: '01', label: 'Concept sketch', heading: 'Every great landscape starts with an idea.', body: 'The first lines establish how the space could work.' },
  { progress: 0.32, number: '02', label: 'Architectural plan', heading: 'The idea becomes a buildable plan.', body: 'Proportion, circulation and every major feature are resolved.' },
  { progress: 0.64, number: '03', label: 'Materials and planting', heading: 'Colour brings the design into focus.', body: 'Planting, finishes and materials reveal the character of the space.' },
  { progress: 0.9, number: '04', label: '3D visualisation', heading: 'See the landscape before it comes to life.', body: 'A clear vision creates confidence before the first shovel hits the ground.' },
];
