from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import trimesh
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
from shapely.affinity import scale as shapely_scale, translate as shapely_translate
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "stl"
ENGINE = "manifold"
CASE_OUTER_SIZE = 36.0
CASE_OUTER_RADIUS = 2.2
CASE_INNER_SIZE = 34.0
CASE_INNER_RADIUS = 1.4
CASE_FRONT_HALF_DEPTH = 6.0
CASE_BACK_HALF_DEPTH = 5.5
CASE_HALF_DEPTH = CASE_FRONT_HALF_DEPTH
CASE_TOTAL_DEPTH = CASE_FRONT_HALF_DEPTH + CASE_BACK_HALF_DEPTH
CASE_FRONT_FACE_THICKNESS = 1.6
CASE_BACK_FACE_THICKNESS = 1.6
CASE_FRONT_HALF_CAVITY_DEPTH = CASE_FRONT_HALF_DEPTH - CASE_FRONT_FACE_THICKNESS
CASE_BACK_HALF_CAVITY_DEPTH = CASE_BACK_HALF_DEPTH - CASE_BACK_FACE_THICKNESS
CASE_HALF_CAVITY_DEPTH = CASE_FRONT_HALF_CAVITY_DEPTH
CASE_INTERNAL_DEPTH = CASE_FRONT_HALF_CAVITY_DEPTH + CASE_BACK_HALF_CAVITY_DEPTH
CASE_FRONT_SPLIT_Z = 0.0
CASE_USB_CENTER_Y = -13.25
CASE_USB_WIDTH = 13.0
CASE_USB_HEIGHT = 4.5
CASE_SCREW_POINTS = (-13.1, 13.1)
CASE_POST_RADIUS = 2.15
CASE_SCREW_CLEARANCE_RADIUS = 1.05
CASE_SCREW_HEAD_RADIUS = 2.2
CASE_SCREW_HEAD_RECESS_DEPTH = 0.6
CASE_SCREW_LENGTH = 5.0
CASE_SCREW_PILOT_RADIUS = 0.85
CASE_POST_HEIGHT = 4.0
CASE_POST_CENTER_Z = -2.0
CASE_POST_PILOT_HEIGHT = 3.6
CASE_POST_PILOT_CENTER_Z = -1.8
CASE_THREAD_PITCH = 0.4
CASE_THREAD_MAJOR_RADIUS = 1.0
CASE_THREAD_MINOR_RADIUS = 0.78
CASE_THREAD_RADIAL_CLEARANCE = 0.05
CASE_LOGO_TEXT = "Shotmind"
CASE_LOGO_HEIGHT = 0.8
CASE_LOGO_MAIN_TARGET_WIDTH = 30.0
CASE_LOGO_CENTER_Y = 0.0
CASE_LOGO_FONT_FAMILY = "DejaVu Sans"
CASE_LOGO_FONT_WEIGHT = "bold"

PICATINNY = {
    "block_height": 5.8,
    "middle_cavity_width": 21.0,
    "bevel_size": 2.0,
    "lower_vertical": 1.0,
    "roof_thickness": 1.0,
    "outer_chamfer": 2.0,
    "depth": 9.0,
    "bottom_y": 19.0,
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
    if hasattr(poly, "geoms"):
        parts = [extrude_polygon(geom, height, z_min=z_min) for geom in poly.geoms if not geom.is_empty]
        return finalize(trimesh.util.concatenate(parts))
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


def concatenate(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    return trimesh.util.concatenate(meshes)


def _text_to_shapely(text: str, font_size: float = 10.0):
    fp = FontProperties(family=CASE_LOGO_FONT_FAMILY, weight=CASE_LOGO_FONT_WEIGHT)
    text_path = TextPath((0.0, 0.0), text, size=font_size, prop=fp)
    rings = [Polygon(ring) for ring in text_path.to_polygons(closed_only=True) if len(ring) >= 3]
    shape = rings[0]
    for ring in rings[1:]:
        shape = shape.symmetric_difference(ring)
    return shape


def centered_text_polygon(text: str, target_width: float):
    shape = _text_to_shapely(text, font_size=10.0)
    min_x, min_y, max_x, max_y = shape.bounds
    current_width = max_x - min_x
    scale = target_width / current_width
    shape = shapely_scale(shape, xfact=scale, yfact=scale, origin=(0.0, 0.0))
    min_x, min_y, max_x, max_y = shape.bounds
    return shapely_translate(shape, xoff=-(min_x + max_x) / 2, yoff=-(min_y + max_y) / 2)


def make_logo_meshes() -> list[trimesh.Trimesh]:
    logo_shape = centered_text_polygon(CASE_LOGO_TEXT, CASE_LOGO_MAIN_TARGET_WIDTH)
    logo_shape = shapely_scale(logo_shape, xfact=-1.0, yfact=1.0, origin=(0.0, 0.0))
    logo_shape = shapely_translate(logo_shape, yoff=CASE_LOGO_CENTER_Y)
    return [
        extrude_polygon(
            logo_shape,
            CASE_LOGO_HEIGHT,
            z_min=-CASE_BACK_HALF_DEPTH - CASE_LOGO_HEIGHT,
        )
    ]


def make_logo_mesh() -> trimesh.Trimesh:
    return concatenate(make_logo_meshes())


def orient_mesh_for_print(
    mesh: trimesh.Trimesh,
    *,
    flip_z: bool = False,
    rotate_z_180: bool = False,
) -> trimesh.Trimesh:
    oriented = mesh.copy()
    if flip_z:
        oriented.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [1.0, 0.0, 0.0]))
    if rotate_z_180:
        oriented.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [0.0, 0.0, 1.0]))
    oriented.apply_translation([0.0, 0.0, -float(oriented.bounds[0][2])])
    return oriented


def metric_thread_radius(
    phase: float,
    pitch: float,
    root_radius: float,
    crest_radius: float,
) -> float:
    u = (phase / pitch) % 1.0
    if u < 0.125:
        factor = 0.0
    elif u < 0.375:
        factor = (u - 0.125) / 0.25
    elif u < 0.625:
        factor = 1.0
    elif u < 0.875:
        factor = 1.0 - (u - 0.625) / 0.25
    else:
        factor = 0.0
    return root_radius + factor * (crest_radius - root_radius)


def make_threaded_hole_tool(
    height: float,
    *,
    pitch: float = CASE_THREAD_PITCH,
    major_radius: float = CASE_THREAD_MAJOR_RADIUS,
    minor_radius: float = CASE_THREAD_MINOR_RADIUS,
    radial_clearance: float = CASE_THREAD_RADIAL_CLEARANCE,
    theta_segments: int = 60,
) -> trimesh.Trimesh:
    crest_radius = major_radius + radial_clearance
    root_radius = minor_radius + radial_clearance * 0.4
    z_segments = max(72, int(math.ceil(height / pitch * 18)))
    thetas = np.linspace(0.0, math.tau, theta_segments, endpoint=False)
    zs = np.linspace(-height / 2, height / 2, z_segments + 1)

    vertices: list[list[float]] = []
    for z in zs:
        lead_scale = min(
            (z + height / 2) / max(pitch, 1e-6),
            (height / 2 - z) / max(pitch, 1e-6),
            1.0,
        )
        lead_scale = max(0.0, min(1.0, lead_scale))
        for theta in thetas:
            phase = (z - pitch * theta / math.tau) % pitch
            radius = metric_thread_radius(phase, pitch, root_radius, crest_radius)
            radius = root_radius + (radius - root_radius) * lead_scale
            vertices.append([radius * math.cos(theta), radius * math.sin(theta), z])

    bottom_center = len(vertices)
    vertices.append([0.0, 0.0, -height / 2])
    top_center = len(vertices)
    vertices.append([0.0, 0.0, height / 2])

    faces: list[list[int]] = []
    ring_count = len(zs)
    for ring_index in range(ring_count - 1):
        ring_start = ring_index * theta_segments
        next_ring_start = (ring_index + 1) * theta_segments
        for segment_index in range(theta_segments):
            a = ring_start + segment_index
            b = ring_start + (segment_index + 1) % theta_segments
            c = next_ring_start + segment_index
            d = next_ring_start + (segment_index + 1) % theta_segments
            faces.append([a, c, b])
            faces.append([b, c, d])

    for segment_index in range(theta_segments):
        a = segment_index
        b = (segment_index + 1) % theta_segments
        faces.append([bottom_center, b, a])

    top_ring_start = (ring_count - 1) * theta_segments
    for segment_index in range(theta_segments):
        a = top_ring_start + segment_index
        b = top_ring_start + (segment_index + 1) % theta_segments
        faces.append([top_center, a, b])

    mesh = trimesh.Trimesh(
        vertices=np.asarray(vertices, dtype=float),
        faces=np.asarray(faces, dtype=np.int64),
        process=True,
    )
    mesh.fix_normals()
    return finalize(mesh)


def picatinny_block(width: float = 35.0, depth: float = 9.0, z_center: float = 0.0) -> trimesh.Trimesh:
    bottom_y = PICATINNY["bottom_y"]
    block_height = PICATINNY["block_height"]
    return make_box(width, block_height, depth, (0.0, bottom_y + block_height / 2, z_center))


def picatinny_cutters(width: float = 35.0, depth: float = 9.0, z_center: float = 0.0) -> list[trimesh.Trimesh]:
    bottom_y = PICATINNY["bottom_y"]
    block_height = PICATINNY["block_height"]
    bevel_size = PICATINNY["bevel_size"]
    middle_half = PICATINNY["middle_cavity_width"] / 2
    opening_half = middle_half - bevel_size
    outer_half = width / 2
    outer_chamfer = PICATINNY["outer_chamfer"]
    top_y = bottom_y + block_height
    cavity_floor_y = bottom_y - PICATINNY["lower_vertical"]
    cavity_top_y = top_y - PICATINNY["roof_thickness"]
    lower_bevel_top_y = bottom_y + bevel_size
    upper_bevel_bottom_y = cavity_top_y - bevel_size
    cavity = extrude_polygon(
        Polygon(
            [
                (-opening_half, cavity_floor_y),
                (-opening_half, bottom_y),
                (-middle_half, lower_bevel_top_y),
                (-middle_half, upper_bevel_bottom_y),
                (-opening_half, cavity_top_y),
                (opening_half, cavity_top_y),
                (middle_half, upper_bevel_bottom_y),
                (middle_half, lower_bevel_top_y),
                (opening_half, bottom_y),
                (opening_half, cavity_floor_y),
            ]
        ),
        depth + 0.8,
        z_min=-(depth + 0.8) / 2,
    )
    cavity.apply_translation([0.0, 0.0, z_center])
    top_opening = extrude_polygon(
        box(-opening_half, cavity_top_y, opening_half, top_y),
        depth + 0.8,
        z_min=-(depth + 0.8) / 2,
    )
    top_opening.apply_translation([0.0, 0.0, z_center])
    left_outer_chamfers = [
        extrude_polygon(
            Polygon(
                [
                    (-outer_half, top_y),
                    (-outer_half + outer_chamfer, top_y),
                    (-outer_half, top_y - outer_chamfer),
                ]
            ),
            depth + 0.8,
            z_min=-(depth + 0.8) / 2,
        ),
        extrude_polygon(
            Polygon(
                [
                    (-outer_half, bottom_y),
                    (-outer_half + outer_chamfer, bottom_y),
                    (-outer_half, bottom_y + outer_chamfer),
                ]
            ),
            depth + 0.8,
            z_min=-(depth + 0.8) / 2,
        ),
    ]
    for cutter in left_outer_chamfers:
        cutter.apply_translation([0.0, 0.0, z_center])
    right_outer_chamfers = [
        extrude_polygon(
            Polygon(
                [
                    (outer_half, top_y),
                    (outer_half - outer_chamfer, top_y),
                    (outer_half, top_y - outer_chamfer),
                ]
            ),
            depth + 0.8,
            z_min=-(depth + 0.8) / 2,
        ),
        extrude_polygon(
            Polygon(
                [
                    (outer_half, bottom_y),
                    (outer_half - outer_chamfer, bottom_y),
                    (outer_half, bottom_y + outer_chamfer),
                ]
            ),
            depth + 0.8,
            z_min=-(depth + 0.8) / 2,
        ),
    ]
    for cutter in right_outer_chamfers:
        cutter.apply_translation([0.0, 0.0, z_center])
    return [cavity, top_opening, *left_outer_chamfers, *right_outer_chamfers]


def apply_picatinny_top(
    body: trimesh.Trimesh,
    width: float = 35.0,
    depth: float = 9.0,
    z_center: float = 0.0,
) -> trimesh.Trimesh:
    return finalize(
        difference(
            union([body, picatinny_block(width, depth, z_center=z_center)]),
            picatinny_cutters(width, depth, z_center=z_center),
        )
    )


def picatinny_foot_bridges(half_depth: float, z_min: float, width: float = 35.0) -> list[trimesh.Trimesh]:
    middle_half = PICATINNY["middle_cavity_width"] / 2
    bevel_size = PICATINNY["bevel_size"]
    opening_half = middle_half - bevel_size
    case_outer_top_y = CASE_OUTER_SIZE / 2
    picatinny_bottom_y = PICATINNY["bottom_y"]
    foot_outer_half = width / 2
    return [
        extrude_polygon(
            box(-foot_outer_half, case_outer_top_y, -opening_half, picatinny_bottom_y),
            half_depth,
            z_min=z_min,
        ),
        extrude_polygon(
            box(opening_half, case_outer_top_y, foot_outer_half, picatinny_bottom_y),
            half_depth,
            z_min=z_min,
        ),
    ]


def create_case_front_half() -> trimesh.Trimesh:
    outer = extrude_polygon(
        rounded_rect(CASE_OUTER_SIZE, CASE_OUTER_SIZE, CASE_OUTER_RADIUS),
        CASE_HALF_DEPTH,
        z_min=CASE_FRONT_SPLIT_Z,
    )
    cavity = extrude_polygon(
        rounded_rect(CASE_INNER_SIZE, CASE_INNER_SIZE, CASE_INNER_RADIUS),
        CASE_HALF_CAVITY_DEPTH,
        z_min=CASE_FRONT_SPLIT_Z,
    )
    front_hole = make_cylinder(8.0, CASE_HALF_DEPTH + 2.0, (0.0, 0.0, CASE_HALF_DEPTH / 2), sections=128)

    screw_holes = []
    screw_head_recesses = []
    for x in CASE_SCREW_POINTS:
        for y in CASE_SCREW_POINTS:
            screw_holes.append(
                make_cylinder(
                    CASE_SCREW_CLEARANCE_RADIUS,
                    CASE_FRONT_FACE_THICKNESS + 0.6,
                    (x, y, CASE_HALF_DEPTH - CASE_FRONT_FACE_THICKNESS / 2),
                    sections=48,
                )
            )
            screw_head_recesses.append(
                make_cylinder(
                    CASE_SCREW_HEAD_RADIUS,
                    CASE_SCREW_HEAD_RECESS_DEPTH,
                    (
                        x,
                        y,
                        CASE_HALF_DEPTH - CASE_SCREW_HEAD_RECESS_DEPTH / 2,
                    ),
                    sections=64,
                )
            )

    body = apply_picatinny_top(outer, depth=CASE_HALF_DEPTH, z_center=CASE_HALF_DEPTH / 2)
    bridges = picatinny_foot_bridges(CASE_HALF_DEPTH, z_min=CASE_FRONT_SPLIT_Z)
    body = union([body, *bridges])
    body = difference(body, [cavity, front_hole, *screw_holes, *screw_head_recesses])
    return finalize(body)


def create_case_back_half() -> trimesh.Trimesh:
    outer = extrude_polygon(
        rounded_rect(CASE_OUTER_SIZE, CASE_OUTER_SIZE, CASE_OUTER_RADIUS),
        CASE_BACK_HALF_DEPTH,
        z_min=-CASE_BACK_HALF_DEPTH,
    )
    cavity = extrude_polygon(
        rounded_rect(CASE_INNER_SIZE, CASE_INNER_SIZE, CASE_INNER_RADIUS),
        CASE_BACK_HALF_CAVITY_DEPTH,
        z_min=-CASE_BACK_HALF_DEPTH + CASE_BACK_FACE_THICKNESS,
    )
    usb_slot_top_z = -1.7
    usb_slot_bottom_z = -CASE_BACK_HALF_DEPTH
    usb_slot_height = usb_slot_top_z - usb_slot_bottom_z
    usb_slot_z_center = (usb_slot_top_z + usb_slot_bottom_z) / 2
    usb_slot = make_box(CASE_USB_WIDTH, CASE_USB_HEIGHT, usb_slot_height, (0.0, CASE_USB_CENTER_Y, usb_slot_z_center))
    shell = apply_picatinny_top(outer, depth=CASE_BACK_HALF_DEPTH, z_center=-CASE_BACK_HALF_DEPTH / 2)
    bridges = picatinny_foot_bridges(CASE_BACK_HALF_DEPTH, z_min=-CASE_BACK_HALF_DEPTH)
    shell = union([shell, *bridges])
    shell = difference(shell, [cavity, usb_slot])

    posts = []
    logo_meshes = make_logo_meshes()
    threaded_hole_template = make_threaded_hole_tool(CASE_POST_PILOT_HEIGHT)
    threaded_holes = []
    for x in CASE_SCREW_POINTS:
        for y in CASE_SCREW_POINTS:
            posts.append(make_cylinder(CASE_POST_RADIUS, CASE_POST_HEIGHT, (x, y, CASE_POST_CENTER_Z), sections=64))
            threaded_hole = threaded_hole_template.copy()
            threaded_hole.apply_translation([x, y, CASE_POST_PILOT_CENTER_Z])
            threaded_holes.append(threaded_hole)

    body = union([shell, *logo_meshes, *posts])
    body = difference(body, threaded_holes)
    return body


def create_case_shell() -> trimesh.Trimesh:
    front = orient_mesh_for_print(create_case_front_half())
    back = orient_mesh_for_print(create_case_back_half(), flip_z=True, rotate_z_180=True)
    front.apply_translation([-24.0, 0.0, 0.0])
    back.apply_translation([24.0, 0.0, 0.0])
    return concatenate([front, back])


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
    body = apply_picatinny_top(union([ring, saddle]))

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
    case_front = orient_mesh_for_print(create_case_front_half())
    case_back = orient_mesh_for_print(create_case_back_half(), flip_z=True, rotate_z_180=True)
    export_part("case-shell-front", case_front)
    export_part("case-shell-back", case_back)
    export_part("case-shell", create_case_shell())
    export_part("ring-clamp", orient_mesh_for_print(create_ring_clamp()))


if __name__ == "__main__":
    main()
