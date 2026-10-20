import {createOfficeScene as createTowerScene} from './demo-tower/office-scene';
import {adaptDemoScene} from './demo-tower/demo-scene-adapter';
// This module is imported only by the simulation branch of OfficeCampus.
export const createOfficeScene=adaptDemoScene(createTowerScene);
