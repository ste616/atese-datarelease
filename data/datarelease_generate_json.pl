#!/usr/bin/perl

use lib '/n/ste616/usr/share/perl/5.14.2';
use Astro::Coord::ECI;
use Astro::Coord::ECI::Sun;
use Astro::Time;
use JSON;
use Data::Dumper;
use POSIX;
use strict;

# Globals.
my %station_positions;
my @configuration_strings;
my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";
my $feval = 5.5; # GHz

# ATCA location.
my ($lat, $lon, $alt) = ( deg2rad(-30.3128846), deg2rad(149.5501388), (236.87 / 1000.0) );
my $loc = Astro::Coord::ECI->geodetic($lat, $lon, $alt);

# Make a JSON file for each source below this directory,
# assigning it an epoch name.

my $epname = $ARGV[0];

my $json = JSON->new;#->indent->space_before->space_after;
# The catalogue of all sources we have.
my $catalogue;
my $catname = $od."/datarelease_catalogue.json";

if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    $catalogue = {};
}

my $odt = $od."/".$epname;
if (!-d $odt) {
    mkdir $odt;
}
$od = $odt;

my @avg_levels = ( 32, 64, 128 );

my @dirs = &findsources();
my @sources = &compilesources(@dirs);
for (my $i = 0; $i <= $#sources; $i++) {
    print "Source: ".$sources[$i]." (".($i + 1)." / ".($#sources + 1).")\n";
    my $d = -1;
    if ($catalogue->{$sources[$i]}) {
	for (my $j = 0; $j <= $#{$catalogue->{$sources[$i]}->{'epochs'}}; $j++) {
	    if ($catalogue->{$sources[$i]}->{'epochs'}->[$j] eq $epname) {
		$d = $j;
		last;
	    }
	}
    } else {
	$catalogue->{$sources[$i]} = {
	    'epochs' => [ $epname ],
	    'rightAscension' => [],
	    'declination' => [],
	    'hourAngle' => [],
	    'closurePhase' => [],
	    'fluxDensity' => [],
	    'defect' => [],
	    'fluxDensityFit' => [],
	    'mjd' => [],
	    'solarAngles' => [],
	    'arrayConfigurations' => []
	}
    }
    my @p = &getprefixes($sources[$i], @dirs);
    my @fs;
    for (my $j = 0; $j <= $#p; $j++) {
	my @f = &getfrequencies($sources[$i], $p[$j]);
	push @fs, \@f;
    }
    my $jsonref = &jsongen($sources[$i], $epname, \@fs, @p);
    my $hamid = sprintf "%.4f", (($jsonref->{'hourAngleRange'}->{'high'} +
				  $jsonref->{'hourAngleRange'}->{'low'}) / 2);
    my $mjdmid = sprintf "%.5f", (($jsonref->{'mjdRange'}->{'low'} +
				   $jsonref->{'mjdRange'}->{'high'}) / 2);
    if ($d == -1) {
	$d = $#{$catalogue->{$sources[$i]}->{'mjd'}} + 1;
    }

    $catalogue->{$sources[$i]}->{'epochs'}->[$d] = $epname;
    $catalogue->{$sources[$i]}->{'rightAscension'}->[$d] = $jsonref->{'rightAscension'};
    $catalogue->{$sources[$i]}->{'declination'}->[$d] = $jsonref->{'declination'};
    $catalogue->{$sources[$i]}->{'hourAngle'}->[$d] = $hamid * 1.0;
    $catalogue->{$sources[$i]}->{'closurePhase'}->[$d] = $jsonref->{'closurePhase'}->[0]->{'average_value'};
    $catalogue->{$sources[$i]}->{'defect'}->[$d] = $jsonref->{'defect'}->[0]->{'defect'};
    $catalogue->{$sources[$i]}->{'fluxDensity'}->[$d] = &coeff2flux($jsonref->{'fluxDensityFits'}->[0]->{'fitCoefficients'}, $feval);
    $catalogue->{$sources[$i]}->{'mjd'}->[$d] = $mjdmid * 1.0;
    $catalogue->{$sources[$i]}->{'arrayConfigurations'}->[$d] = $jsonref->{'arrayConfiguration'};

    # Calculate the solar position.
    my $t = mjd2epoch($mjdmid * 1.0);
    my $sun = Astro::Coord::ECI::Sun->universal($t);
    # And the distance between it and our source.
    my $p = Astro::Coord::ECI->equatorial(
	str2rad($jsonref->{'rightAscension'}, "H"), str2rad($jsonref->{'declination'}, "D"), 1e12, $t);
    my $sep = rad2deg(abs($loc->angle($sun, $p)));
    $catalogue->{$sources[$i]}->{'solarAngles'}->[$d] = $sep;

    my $alphas = &fluxModel2Alphas($jsonref->{'fluxDensityFits'}->[0]->{'fitCoefficients'}, 5.5, 1);
    unshift @{$alphas}, &coeff2flux($jsonref->{'fluxDensityFits'}->[0]->{'fitCoefficients'}, 5.5);

    $catalogue->{$sources[$i]}->{'fluxDensityFit'}->[$d] = {
	'fitCoefficients' => $jsonref->{'fluxDensityFits'}->[0]->{'fitCoefficients'},
	'fitScatter' => $jsonref->{'fluxDensityFits'}->[0]->{'fitScatter'},
	'alphas5.5' => $alphas,
	'closest5.5' => [],
	'frequencyRange' => []
    };
#    }

    my $jsonfile = $od."/".$sources[$i]."_".$epname.".json";
    open(OUT, ">".$jsonfile);
    print OUT $json->encode($jsonref);
    close(OUT);

    my $orig_json_text = $json->encode($jsonref);

    # Now do the averaging as well.
    for (my $av = 0; $av <= $#avg_levels; $av++) {
	$jsonref = $json->decode($orig_json_text);
	my $farray = $jsonref->{'fluxDensityData'};
	for (my $j = 0; $j <= $#{$farray}; $j++) {
	    my $na = &average_data($farray->[$j]->{'data'}, $avg_levels[$av]);
	    $farray->[$j]->{'data'} = $na;
	}

	# Write out the new data.
	my $avjsonfile = $od."/".$sources[$i]."_".$epname.".averaged".$avg_levels[$av].".json";
	open(OUT, ">".$avjsonfile);
	print OUT $json->encode($jsonref);
	close(OUT);

	# Grab some information if we are at 64 MHz resolution.
	if ($avg_levels[$av] == 64) {
	    for (my $j = 0; $j <= $#{$farray}; $j++) {
		if ($farray->[$j]->{'stokes'} eq "I" &&
		    $farray->[$j]->{'mode'} eq "vector") {
		    my $lfd = $#{$farray->[$j]->{'data'}};
		    $catalogue->{$sources[$i]}->{'fluxDensityFit'}->[$d]->{'frequencyRange'} =
			[ $farray->[$j]->{'data'}->[0]->[0],
			  $farray->[$j]->{'data'}->[$lfd]->[0] ];
		    $catalogue->{$sources[$i]}->{'fluxDensityFit'}->[$d]->{'closest5.5'} =
			$farray->[$j]->{'data'}->[0];
		    my $diff1 = $catalogue->{$sources[$i]}->{'fluxDensityFit'}->[$d]->{'closest5.5'}->[0] - 5.5;
		    for (my $kk = 1; $kk <= $lfd; $kk++) {
			my $diff2 = $farray->[$j]->{'data'}->[$kk]->[0] - 5.5;
			if (abs($diff2) < abs($diff1)) {
			    $diff1 = $diff2;
			    $catalogue->{$sources[$i]}->{'fluxDensityFit'}->[$d]->{'closest5.5'} =
				$farray->[$j]->{'data'}->[$kk];
			}
		    }
		}
	    }
	}
    }
}

open(C, ">".$catname);
print C to_json $catalogue;
close(C);

sub getfrequencies {
    my $src = shift;
    my $pfx = shift;

    my @freqs = map { chomp(my $a = $_); $a =~ s/^.*\.//; $a } `ls -d $pfx/$src.*`;

    return @freqs;
}

sub getprefixes {
    my $src = shift;
    my @dirs = @_;
    
    my @pfx;
    my $s = quotemeta $src;
    for (my $i = 0; $i <= $#dirs; $i++) {
	if ($dirs[$i] =~ /^(.*)\/$s$/) {
	    push @pfx, $1;
	}
    }
    return @pfx;
}

sub compilesources {
    my @d = @_;

    my @l = map { my $a = $_; $a =~ s/^.*\///; $a } @d;

    my @sl = sort @l;

    for (my $i = 0; $i < $#sl; $i++) {
	if ($sl[$i] eq $sl[$i + 1]) {
	    splice @sl, ($i + 1), 1;
	    $i--;
	}
    }
    return @sl;
}

sub findsources {
    my @dirs = map { chomp(my $a = $_); $a =~ s/^\.\///; $a =~ s/\.[^\.]*$//; $a } `find . -path "./v3_redo/*/*/visdata"`;
    
    my @sdirs = sort @dirs;

    for (my $i = 0; $i < $#sdirs; $i++) {
	if ($sdirs[$i] eq $sdirs[$i + 1]) {
	    splice @sdirs, ($i + 1), 1;
	    $i--;
	}
    }

    return @sdirs;
}

sub jsongen {
    my $src = shift;
    my $ename = shift;
    my $freqref = shift;
    my @ps = @_;

    my @stokes = ( 'i' );
    my @orders = ( 3 );
    my @options = ( ",log" );

    
    my %ro = (
	'source' => $src,
	'epochName' => $ename,
	'rightAscension' => "",
	'declination' => "",
	'mjdRange' => { 'low' => 0, 'high' => 0 },
	'arrayConfiguration' => "",
	'hourAngleRange' => { 'low' => 0, 'high' => 0 },
	'closurePhase' => [],
	'fluxDensityFits' => [],
	'fluxDensityData' => [],
	'defect' => []
	);
	
    for (my $i = 0; $i <= $#stokes; $i++) {
	my $p = $ps[0]."/".$src;
	my $o = $od."/".$src;
	if ($stokes[$i] ne "i") {
	    $o .= ".".$stokes[$i];
	}
	$o .= ".plotgen";

	if ($i == 0) {
	    my $minmjd = 1e9;
	    my $maxmjd = 0;
	    my @ras = ();
	    my @decs = ();
	    for (my $j = 0; $j <= $#ps; $j++) {
		my $p1 = $ps[$j]."/".$src;
		# Get RA, Dec and the MJD range.
		my $tcmd = "dac_repeat.pl --task uvindex --repeat vis ".
		    "--repeat-freq $p1";
		open(T, "-|") || exec $tcmd;
		my $nl = 0;
		while(<T>) {
		    chomp;
		    my @els = split(/\s+/);
		    if ($els[0] =~ /^[0-9][0-9][A-Z][A-Z][A-Z][0-3][0-9]\:/) {
			my $dcmd = "miriadtime2mjd.pl $els[0]";
			open(D, "-|") || exec $dcmd;
			while(<D>) {
			    chomp;
			    my @dels = split(/\s+/);
			    my $tmjd = $dels[$#dels];
			    $minmjd = ($tmjd < $minmjd) ? $tmjd : $minmjd;
			    $maxmjd = ($tmjd > $maxmjd) ? $tmjd : $maxmjd;
			}
			close(D);
		    } elsif ($els[1] eq "Source" && $els[2] eq "CalCode") {
			$nl = 1;
		    } elsif ($nl == 1) {
			$nl = 0;
			push @ras, $els[2];
			push @decs, $els[3];
		    }
		}
		close(T);

		# Get the closure phase.
		for (my $k = 0; $k <= $#{$freqref->[$j]}; $k++) {
		    my $p2 = $p1.".".$freqref->[$j]->[$k];
		    my %clop = &measure_closure_phase($p2);
		    push @{$ro{'closurePhase'}}, {
			'IF' => $freqref->[$j]->[$k] * 1,
			'average_value' => $clop{'closure_phase'}->{'average_value'} * 1.0,
			'measured_rms' => $clop{'closure_phase'}->{'measured_rms'} * 1.0,
			'theoretical_rms' => $clop{'closure_phase'}->{'theoretical_rms'} * 1.0
		    };
		}
	    }
	    my $mjdlow = sprintf "%.5f", $minmjd;
	    my $mjdhigh = sprintf "%.5f", $maxmjd;
	    $ro{'mjdRange'}->{'low'} = $mjdlow * 1.0;
	    $ro{'mjdRange'}->{'high'} = $mjdhigh * 1.0;
	    $ro{'rightAscension'} = $ras[0];
	    $ro{'declination'} = $decs[0];

	    # Calculate the hour angle ranges.
	    my $atca_long = 149.5501388;
	    my $minlst = mjd2lst($minmjd, $atca_long);
	    my $maxlst = mjd2lst($maxmjd, $atca_long);
	    my $raturns = str2turn($ras[0], "H");
	    my $loha = (($minlst - $raturns) * 24.0);
	    if ($loha < -12) {
		$loha += 24.0;
	    } elsif ($loha > 12) {
		$loha -= 24.0;
	    }
	    my $hiha = (($maxlst - $raturns) * 24.0);
	    if ($hiha < -12) {
		$hiha += 24.0;
	    } elsif ($loha > 12) {
		$hiha -= 24.0;
	    }
	    if ($hiha < $loha) {
		my $tha = $loha;
		$loha = $hiha;
		$hiha = $tha;
	    }

	    my $halow = sprintf "%.4f", $loha;
	    my $hahigh = sprintf "%.4f", $hiha;
	    $ro{'hourAngleRange'}->{'low'} = $halow * 1.0;
	    $ro{'hourAngleRange'}->{'high'} = $hahigh * 1.0;

	    # Get the array configuration.
	    my $ap = $p.".".$freqref->[0]->[0];
	    $ro{'arrayConfiguration'} = &determine_array($ap);
	    
	}
	
	# Measure the flux densities.
	if ($p ne "") {
	    my $pcmd = "uvfmeas order=".$orders[$i]." stokes=".$stokes[$i]." device=tmp.ps/cps".
		" vis=\"";
	    for (my $j = 0; $j <= $#ps; $j++) {
		if ($j > 0) {
		    $pcmd .= ",";
		}
		$pcmd .= $ps[$j]."/".$src.".*";
	    }
	    $pcmd .= "\"";
	    my $pvcmd = $pcmd." options=plotvec,mfflux,machine,malpha".$options[$i]." log=fluxdensities.txt > tmp.log";
	    system "rm tmp.log fluxdensities.txt";
	    system $pvcmd;
	    
	    push @{$ro{'fluxDensityFits'}}, &readlog("tmp.log");
	    my $vecdens = &readdata("fluxdensities.txt");
	    push @{$ro{'fluxDensityData'}}, {
		'stokes' => 'I', 'mode' => 'vector',
		'data' => $vecdens
	    };
	    
	    my $pscmd = $pcmd." options=machine".$options[$i]." log=fluxdensities2.txt > tmp2.log";
	    system "rm tmp2.log fluxdensities2.txt";
	    system $pscmd;
	    my $scadens = &readdata("fluxdensities2.txt");
	    my $dsum = 0.0;
	    my $dnum = 0;
	    my $defect = 0.0;
	    for (my $j = 0; $j <= $#{$vecdens}; $j++) {
		if ($vecdens->[$j]->[1] > 0) {
		    $dsum += ($scadens->[$j]->[1] / $vecdens->[$j]->[1]);
		    $dnum++;
		}
	    }
	    if ($dnum > 0) {
		$defect = sprintf "%.1f", (($dsum / $dnum) - 1.0) * 100.0;
	    }
	    push @{$ro{'defect'}}, {
		'stokes' => 'I', 'defect' => ($defect * 1.0)
	    };
	}

	
    }
    return \%ro;
}

sub coeff2flux {
    my $coeff = shift;
    my $freq = shift;

    my $s = $coeff->[0];
    my $lf = log($freq) / log(10);
    if ($coeff->[$#{$coeff}] ne 'log') {
	$lf = $freq;
    }
    for (my $i=1; $i<$#{$coeff}; $i++) {
	$s += $coeff->[$i] * $lf**$i;
    }
    if ($coeff->[$#{$coeff}] eq 'log') {
	$s = 10**$s;
    }

    my $ss = sprintf "%.3f", $s;
    return ($ss * 1.0);
}

sub average {
    my @a = @_;
    
    my $s = 0;
    for (my $i=0; $i<=$#a; $i++) {
	$s += $a[$i];
    }
    $s /= ($#a + 1);

    return $s;
}

sub removecomma {
    my $s = shift;

    $s =~ s/\,//g;

    return $s;
}

sub readdata {
    my $fname = shift;

    my @d;
    open(F, $fname);
    while(<F>) {
	chomp;
	my @e = split(/\s+/);
	my $frq = sprintf "%.3f", $e[1];
	my $fld = sprintf "%.3f", $e[2];
	push @d, [ $frq * 1.0, $fld * 1.0 ];
    }
    close(F);

    my @sd = sort { $a->[0] <=> $b->[0] } @d;
    
    return \@sd;
}

sub readlog {
    my $logname = shift;

    my %rv = (
	'fitCoefficients' => [],
	'alphaCoefficients' => [],
	'alphaReference' => { 'fluxDensity' => 0, 'frequency' => 0 },
	'fitScatter' => 0,
	'mode' => "",
	'stokes' => ""
	);
    
    open(L, $logname);
    while(<L>) {
	chomp(my $line = $_);
	my @e = split(/\s+/, $line);
	if ($e[0] eq "Coeff:") {
	    for (my $i = 1; $i < $#e; $i++) {
		push @{$rv{'fitCoefficients'}}, $e[$i] * 1.0;
	    }
	    push @{$rv{'fitCoefficients'}}, $e[$#e];
	} elsif ($e[0] eq "MFCAL") {
	    $rv{'alphaReference'}->{'fluxDensity'} = &removecomma($e[2]) * 1.0;
	    $rv{'alphaReference'}->{'frequency'} = &removecomma($e[3]) * 1.0;
	} elsif ($e[0] eq "Alpha:") {
	    for (my $i = 1; $i <= $#e; $i++) {
		push @{$rv{'alphaCoefficients'}}, $e[$i] * 1.0;
	    }
	} elsif ($e[0] eq "Scatter") {
	    my $fsc = sprintf "%.3f", $e[3];
	    $rv{'fitScatter'} = $fsc * 1.0;
	} elsif ($e[3] eq "Coefficients:") {
	    $rv{'mode'} = lc($e[0]);
	} elsif ($e[0] eq "Stokes") {
	    $rv{'stokes'} = $e[1];
	}
    }
    close(L);

    return \%rv;
}

sub execute_miriad {
    my ($miriad_command)=@_;

    my @miriad_output;
    #print "EE executing $miriad_command\n";
    open(MIRIAD,"-|")||exec $miriad_command." 2>&1";
    while(<MIRIAD>){
	chomp;
	my $line=$_;
	push @miriad_output,$line;
    }
    close(MIRIAD);

    return @miriad_output;
}

sub load_configurations {
    if ($#configuration_strings > -1) {
	# Already loaded and cached.
	return;
    }

    open(ARRAYS, "/n/ste616/src/configuration_stations.file");
    while(<ARRAYS>) {
	chomp;
	push @configuration_strings, $_;
    }
    close(ARRAYS);

    return;
}

sub determine_array {
    my $set = shift;

    # Load the required data.
    &load_configurations();

    # Get the positions of the antennas.
    my $cmd = "uvlist vis=".$set." options=full,array";
    my @cout = &execute_miriad($cmd);

    my %antpos = (
	'x' => [], 'y' => [], 'z' => [] );
    for (my $i=0; $i<=$#cout; $i++) {
	my @els = split(/\s+/, $cout[$i]);
	if ($els[1] > 0 && $els[1] < 7) {
	    $antpos{'x'}->[$els[1] - 1] = $els[2];
	    $antpos{'y'}->[$els[1] - 1] = $els[3];
	    $antpos{'z'}->[$els[1] - 1] = $els[4];
	}
    }

    # Adjust to make antenna 6 the reference.
    for (my $i=0; $i<6; $i++) {
	$antpos{'x'}->[$i] -= $antpos{'x'}->[5];
	$antpos{'y'}->[$i] -= $antpos{'y'}->[5];
	$antpos{'z'}->[$i] -= $antpos{'z'}->[5];
	$antpos{'x'}->[$i] *= -1;
	$antpos{'y'}->[$i] *= -1;
	$antpos{'z'}->[$i] *= -1;
    }

    # The station interval is 15.3m.
    my $station_interval = 15.3;
    my @array_stations;
    for (my $i=0; $i<6; $i++) {
	my $ew_offset = floor(($antpos{'y'}->[$i] / $station_interval) + 0.5) + 392;
	my $ns_offset = floor(($antpos{'x'}->[$i] / $station_interval) + 0.5) + 0;
	if ($ns_offset == 0) {
	    push @array_stations, "W".$ew_offset;
	} else {
	    push @array_stations, "N".$ns_offset;
	}
    }

    # Find the best match to the array.
    my $max_matches = 0;
    my $match_array = '';
    for (my $i=0; $i<=$#configuration_strings; $i++) {
	my $curr_match_count = 0;
	for (my $j=0; $j<=$#array_stations; $j++){
	    if ($configuration_strings[$i] =~ /$array_stations[$j]/){
		$curr_match_count++;
	    }
	}
	if ($curr_match_count > $max_matches){
	    $max_matches = $curr_match_count;
	    $match_array = $configuration_strings[$i];
	}
    }

    return $match_array;
}

sub measure_closure_phase {
    my $set = shift;

    my $closurelog = "closure_log.txt";
    my $cmd = "closure vis=".$set." stokes=i device=/null options=log";
    if (-e $closurelog) {
	system "rm -f ".$closurelog;
    }
    my @cout = &execute_miriad($cmd);

    my %rv = (
	'closure_phase' => { 'theoretical_rms' => 0, 
			     'measured_rms' => 0,
			     'average_value' => -999 }
	);
    for (my $i=0; $i<=$#cout; $i++) {
	my @els = split(/\s+/, $cout[$i]);
	if ($els[0] eq "Actual") {
	    $rv{'closure_phase'}->{'measured_rms'} = $els[$#els];
	} elsif ($els[0] eq "Theoretical") {
	    $rv{'closure_phase'}->{'theoretical_rms'} = $els[$#els];
	}
    }

    if (-e $closurelog) {
	my @pvals;
	open(F, "closure_log.txt");
	while(<F>) {
	    chomp;
	    my @els = split(/\s+/);
	    if ($#els == 2) {
		push @pvals, $els[2];
	    }
	}
	close(F);
	$rv{'closure_phase'}->{'average_value'} = 
	    sprintf "%.3f", &average(@pvals);
    }

    return %rv;
}

sub fluxModel2Alphas {
    my $model = shift;
    my $referenceFreq = shift;
    my $basee = shift;

    my $isLog = ($model->[$#{$model}] eq "log");
    if (!$isLog) {
	return [];
    }
    my $f = $referenceFreq;
    my $a = ($#{$model} >= 2) ? $model->[1] : 0;
    my $b = ($#{$model} >= 3) ? $model->[2] : 0;
    my $c = ($#{$model} == 4) ? $model->[3] : 0;
    my $alphas = [];
    if ($#{$model} >= 2) {
	push @{$alphas}, $a;
	if ($#{$model} >= 3) {
	    my $a2 = $b;
	    if ($basee) {
		$a2 *= log(exp(1)) / log(10.0);
	    }
	    $alphas->[0] += (($basee) ? log($f) : log($f) / log(10.0)) * 2 * $a2;
	    push @{$alphas}, $a2;
	    if ($#{$model} == 4) {
		my $a3 = $c;
		if ($basee) {
		    $a3 *= (log(exp(1)) / log(10.0)) ** 2;
		}
		$alphas->[0] += (($basee) ? (log($f) ** 2) : (log($f) / log(10.0)) ** 2) * 3 * $a3;
		$alphas->[1] += (($basee) ? log($f) : log($f) / log(10.0)) * 3 * $a3;
		push @{$alphas}, $a3;
	    }
	}
    }
    return $alphas;
}

sub average_data {
    my $aref = shift;
    my $avg = shift;

    # Change the average to GHz from MHz.
    $avg /= 1000;

    # The new array.
    my @narr;

    my @f;
    my @a;
    my $s = 0;
    for (my $i = 0; $i <= $#{$aref}; $i++) {
	my $tf = $aref->[$i]->[0];
	my $ta = $aref->[$i]->[1];
	if (($s == 1) &&
	    ($tf < ($f[0] + $avg))) {
	    push @f, $tf;
	    push @a, $ta;
	} elsif ($s == 1) {
	    my $avf = &avgarr(\@f);
	    my $ava = &avgarr(\@a);
	    push @narr, [ $avf, $ava ];
	    $s = 0;
	}
	if ($s == 0) {
	    @f = ( $tf );
	    @a = ( $ta );
	    $s = 1;
	}
    }

    return \@narr;
}

sub avgarr {
    my $aref = shift;

    my $s = $aref->[0];
    my $n = 1;

    for (my $i = 1; $i <= $#{$aref}; $i++) {
	$s += $aref->[$i];
	$n++;
    }

    return ($s / $n);
}
