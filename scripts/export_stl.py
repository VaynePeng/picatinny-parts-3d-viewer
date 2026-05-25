from __future__ import annotations

from pathlib import Path

import trimesh
from shapely.geometry import Point, Polygon, box

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "stl"
ENGINE = "manifold"

PICATINNY = {
    "top_width": 21.4,
    "lower_opening": 16.0,
    "height": 5.8,
    "depth": 9.0,
    "top_chamfer": 1.3,
    "hook_shoulder": 1.25,
    "base_height": 1.35,
    "local_bottom_y": 17.0,
}


def rounded_rect(width: float, height: float, radius: float) -> Polygon:
    return box(
        -width / 2 + radius,
        -height / 2 + radius,
        width / 2 - radius,
        height / 2 - radius,
    ).buffer(radius, resolution=32, join_style=1)


def circle(radius: float, resolution: int = 64):
    return Point(0, 0).buffer(radius, resolution=resolution)


def extrude_polygon(poly, height: float, *, z_min: float) -> trimesh.Trimesh:
    mesh = trimesh.creation.extrude_polygon(poly, height)
    mesh.apply_translation([0.0, 0.0, z_min])
    return mesh


def make_box(width: float, height: float, depth: float, center: tuple[float, float, float]):
    mesh = trimesh.creation.box(extents=[width, height, depth])
    mesh.apply_translation(center)
    return mesh


def make_cylinder(radius: float, height: float, center: tuple[float, float, float], sections: int = 96):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    mesh.apply_translation(center)
    return mesh


def union(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    meshes = [mesh for mesh in meshes if mesh is not None]
    if len(meshes) == 1:
        return meshes[0].copy()
    return trimesh.boolean.union(meshes, engine=ENGINE)


def difference(base: trimesh.Trimesh, cutters: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    cutters = [mesh for mesh in cutters if mesh is not None]
    if not cutters:
        return base.copy()
    if len(cutters) == 1:
        tool = cutters[0]
    else:
        tool = union(cutters)
    return trimesh.boolean.difference([base, tool], engine=ENGINE)


def finalize(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces())
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    mesh.process(validate=True)
    return mesh


def picatinny_slot(width: float = 35.0, depth: float = 9.0) -> trimesh.Trimesh:
    outer_half = width / 2
    top_half = PICATINNY["top_width"] / 2
    lower_half = PICATINNY["lower_opening"] / 2
    bottom_y = PICATINNY["local_bottom_y"]
    floor_y = bottom_y + PICATINNY["base_height"]
    lip_rise = (PICATINNY["top_width"] - PICATINNY["lower_opening"]) / 2
    bearing_top_y = floor_y + lip_rise
    top_y = bottom_y + PICATINNY["height"]
    shoulder_y = top_y - PICATINNY["top_chamfer"]
    hook_neck_y = top_y - PICATINNY["hook_shoulder"]

    profile = Polygon(
        [
            (-top_half, top_y),
            (-top_half - 2.15, top_y),
            (-outer_half + PICATINNY["top_chamfer"], top_y),
            (-outer_half, shoulder_y),
            (-outer_half, bottom_y + 0.85),
            (-outer_half + 1.15, bottom_y),
            (-lower_half, bottom_y),
            (lower_half, bottom_y),
            (outer_half - 1.15, bottom_y),
            (outer_half, bottom_y + 0.85),
            (outer_half, shoulder_y),
            (outer_half - PICATINNY["top_chamfer"], top_y),
            (top_half + 2.15, top_y),
            (top_half, top_y),
            (top_half + 1.25, hook_neck_y),
            (top_half, bearing_top_y),
            (lower_half, floor_y),
            (-lower_half, floor_y),
            (-top_half, bearing_top_y),
            (-top_half - 1.25, hook_neck_y),
        ]
    )
    slot = extrude_polygon(profile, depth, z_min=-depth / 2)
    slot.apply_translation([0.0, 0.5, 0.0])
    return slot


def create_case_shell() -> trimesh.Trimesh:
    outer = extrude_polygon(rounded_rect(35.0, 35.0, 2.2), 9.0, z_min=-4.5)
    cavity = extrude_polygon(rounded_rect(33.0, 33.0, 1.4), 7.0, z_min=-4.5)
    front_hole = make_cylinder(8.0, 12.0, (0.0, 0.0, 0.0), sections=128)
    usb_slot = make_box(13.0, 4.5, 4.0, (0.0, -14.25, -3.6))

    base = difference(outer, [cavity, front_hole, usb_slot])

    posts = []
    pilot_holes = []
    counterbores = []
    for x in (-13.1, 13.1):
        for y in (-13.1, 13.1):
            posts.append(make_cylinder(2.15, 5.0, (x, y, -2.0), sections=64))
            pilot_holes.append(make_cylinder(0.85, 5.6, (x, y, -1.7), sections=48))
            counterbores.append(make_cylinder(1.35, 1.4, (x, y, -3.8), sections=48))

    body = union([base, *posts, picatinny_slot()])
    body = difference(body, [*pilot_holes, *counterbores])
    return finalize(body)


def saddle_polygon() -> Polygon:
    return Polygon(
        [
            (-16.3, 13.2),
            (-15.75, 14.75),
            (-14.9, 16.3),
            (-12.8, 18.55),
            (-15.0, 19.05),
            (-15.0, 20.05),
            (15.0, 20.05),
            (15.0, 19.05),
            (12.8, 18.55),
            (14.9, 16.3),
            (15.75, 14.75),
            (16.3, 13.2),
            (11.7, 13.2),
            (8.0, 15.75),
            (4.0, 17.0),
            (0.0, 17.08),
            (-4.0, 17.0),
            (-8.0, 15.75),
            (-11.7, 13.2),
        ]
    )


def create_ring_clamp() -> trimesh.Trimesh:
    ring = extrude_polygon(circle(17.5).difference(circle(15.5)), 9.0, z_min=-4.5)
    saddle = extrude_polygon(saddle_polygon(), 9.0, z_min=-4.5)
    body = union([ring, saddle, picatinny_slot()])

    grooves = []
    for x, angle in ((-13.4, -0.28), (13.4, 0.28)):
        groove = make_box(0.55, 5.2, 9.18, (x, 17.25, 0.0))
        groove.apply_transform(trimesh.transformations.rotation_matrix(angle, [0.0, 0.0, 1.0], [x, 17.25, 0.0]))
        grooves.append(groove)

    body = difference(body, grooves)
    return finalize(body)


def export_part(name: str, mesh: trimesh.Trimesh) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    path = OUTPUT_DIR / f"{name}.stl"
    mesh.export(path, file_type="stl_ascii")
    bounds = mesh.bounds
    size = bounds[1] - bounds[0]
    print(
        f"{path.name}: watertight={mesh.is_watertight}, "
        f"size_mm=({size[0]:.2f}, {size[1]:.2f}, {size[2]:.2f}), "
        f"volume_mm3={mesh.volume:.2f}"
    )


def main() -> None:
    export_part("case-shell", create_case_shell())
    export_part("ring-clamp", create_ring_clamp())


if __name__ == "__main__":
    main()
